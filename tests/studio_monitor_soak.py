"""Observe a published SCADA view and record continuous read-only trial evidence."""
import argparse
import hashlib
import json
import os
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from playwright.sync_api import sync_playwright


def endpoints(view):
    url = urlsplit(view)
    if url.scheme not in {"http", "https"} or not url.hostname or url.path.rstrip("/") != "/view":
        raise ValueError("请使用已发布监视画面的 HTTP(S) /view 地址")
    project = parse_qs(url.query).get("project", [])
    query = urlencode({"project": project[0]}) if project else ""
    return tuple(urlunsplit((url.scheme, url.netloc, "/api/" + name, query, ""))
                 for name in ("published", "versions"))


def release_at(page, url):
    response = page.request.get(url, timeout=8000)
    if not response.ok:
        raise RuntimeError(f"读取发布版本失败（HTTP {response.status}）")
    versions = response.json()
    release = next((v for v in versions["versions"] if v["id"] == versions["active"]), None)
    if not release:
        raise RuntimeError("工程尚无活动发布版本")
    manifest = release.get("manifest", {})
    return {
        "id": release["id"], "documentHash": manifest.get("documentSha256"),
        "deploymentHash": manifest.get("deploymentSha256"),
        "deploymentMatches": release.get("deploymentMatches"),
        "documentMatches": release.get("documentMatches"),
    }


def probe(page):
    result = page.evaluate("""() => {
        const badge = document.querySelector('[data-monitor-source]');
        const dialog = document.querySelector('.runtime-point-dialog[open]');
        if (!badge || !dialog) throw Error('测点诊断不可用');
        const number = value => value === undefined ? null : Number(value);
        const points = [...dialog.querySelectorAll('[data-monitor-point]')].map(row => ({
            id: row.dataset.monitorPoint,
            kind: row.dataset.monitorKind,
            channel: row.dataset.monitorChannel || 'primary',
            quality: row.dataset.monitorQuality,
            reason: row.dataset.monitorReason || null,
            sampleAtMs: number(row.dataset.monitorSampleAt),
            receivedAtMs: number(row.dataset.monitorReceivedAt),
        }));
        const trendHosts = [...document.querySelectorAll('[data-shape="screen-trend"] .screen-chart-host')];
        return {
            browserAtMs: Date.now(),
            link: badge.dataset.monitorLink,
            datasetsLink: badge.dataset.monitorDatasetsLink || null,
            source: badge.dataset.monitorSource,
            maxAgeMs: number(badge.dataset.monitorMaxAge),
            timing: badge.dataset.monitorTiming ? JSON.parse(badge.dataset.monitorTiming) : null,
            nodes: document.querySelectorAll('.x6-node').length,
            pipes: document.querySelectorAll('.x6-edge').length,
            trendSamples: trendHosts.map(host => globalThis.echarts?.getInstanceByDom(host)
                ?.getOption()?.series?.map(series => series.data?.length || 0) || []),
            renderedEventRows: [...document.querySelectorAll('[data-shape="screen-events"] .screen-table-host tbody')]
                .map(body => [...body.rows].filter(row => row.cells[0] &&
                    !row.cells[0].hasAttribute('colspan')).length),
            points,
        };
    }""")
    if result["source"] not in {"rest", "ws", "opcua", "modbus"}:
        raise RuntimeError("当前工程使用本地样本，连续值守需使用网络数据源")
    if not result["points"] or not result["nodes"]:
        raise RuntimeError("监视画面没有可观测的绑定测点")
    return result


def published_points(document, view):
    query = parse_qs(urlsplit(view).query)
    requested = query.get("page", [document.get("defaultPageId") or "main"])[0]
    page = next((p for p in document.get("pages", []) if p["id"] == requested), document)
    page_id = page["id"] if page is not document else "main"
    used = {point for item in page["nodes"] + page["pipes"] if not item.get("hidden")
            for point in item.get("bindings", {}).values() if point}
    datasets = (document["source"].get("datasets") or {}).get("bindings", {})
    points = {mapping["id"]: (mapping["kind"], "datasets" if mapping["kind"] == "dataset" and
                              datasets.get(mapping["id"]) else "primary")
              for mapping in document["mappings"] if mapping["id"] in used}
    if not points or set(points) != used:
        raise RuntimeError("已发布画面缺少可核对的测点或映射")
    return page_id, points


def verify_observed_points(reading, expected):
    actual = {item["id"]: (item["kind"], item["channel"]) for item in reading["points"]}
    if len(actual) != len(reading["points"]):
        raise RuntimeError("测点诊断中出现重复的业务位号")
    missing = sorted(expected.keys() - actual.keys())
    extra = sorted(actual.keys() - expected.keys())
    changed = sorted(key for key in actual.keys() & expected.keys() if actual[key] != expected[key])
    differences = [label + " " + ", ".join(keys) for label, keys in (
        ("缺少测点", missing), ("多出测点", extra), ("类型或来源不符", changed)) if keys]
    if differences:
        raise RuntimeError("测点诊断与已发布画面不一致。" + " · ".join(differences))


def observed_gap(previous, current):
    return max(current[0] - previous[0], current[1] - previous[1])


def record_connection(windows, link, elapsed, observed_at):
    if not windows or windows[-1]["link"] != link:
        if windows:
            prior = windows[-1]
            prior["transitionObservedAt"] = observed_at
            if link == "connected" and prior["link"] == "disconnected":
                prior["recoveryObservedSeconds"] = round(elapsed - prior["firstElapsedSeconds"], 3)
        windows.append({"link": link, "firstObservedAt": observed_at,
                        "firstElapsedSeconds": elapsed, "observations": 0})
    window = windows[-1]
    window["lastObservedAt"] = observed_at
    window["lastElapsedSeconds"] = elapsed
    window["observations"] += 1
    window["observedSpanSeconds"] = round(elapsed - window["firstElapsedSeconds"], 3)


def record_observation(summary, reading, source_timed_points, elapsed, observed_at):
    record_connection(summary.setdefault("connectionWindows", []), reading["link"], elapsed, observed_at)
    if reading.get("datasetsLink"):
        link = reading["datasetsLink"]
        record_connection(summary.setdefault("datasetConnectionWindows", []), link, elapsed, observed_at)
        summary.setdefault("datasetLinkObservations", Counter())[link] += 1

    load = summary.setdefault("renderLoad", {})
    counts = {"nodes": reading["nodes"], "pipes": reading["pipes"],
              "trendSamples": sum(sum(series) for series in reading["trendSamples"]),
              "renderedEventRows": sum(reading["renderedEventRows"])}
    for name, value in counts.items():
        limits = load.setdefault(name, {"min": value, "max": value})
        limits["min"] = min(limits["min"], value)
        limits["max"] = max(limits["max"], value)

    point_stats = summary.setdefault("pointStats", {})
    for point in reading["points"]:
        stats = point_stats.setdefault(point["id"], {
            "kind": point["kind"], "channel": point.get("channel", "primary"),
            "timeBasis": "source" if point["id"] in source_timed_points else "receive",
            "qualityObservations": Counter(), "reasonObservations": Counter(),
        })
        stats["qualityObservations"][point["quality"]] += 1
        if point["reason"]:
            stats["reasonObservations"][point["reason"]] += 1
        if point["quality"] != "good":
            if point["quality"] != "waiting":
                stats.setdefault("firstAbnormalAt", observed_at)
                stats["lastAbnormalAt"] = observed_at
            continue
        stats["lastGoodAt"] = observed_at
        received_at = point["receivedAtMs"]
        if isinstance(received_at, (int, float)) and received_at > 0:
            previous = stats.get("lastGoodReceivedAtMs")
            stats.setdefault("receiveTimeAdvances", 0)
            if previous is not None and received_at > previous:
                stats["receiveTimeAdvances"] += 1
            stats["lastGoodReceivedAtMs"] = received_at
            age = reading["browserAtMs"] - received_at
            if age >= 0:
                stats["maxReceiveAgeMs"] = max(stats.get("maxReceiveAgeMs", 0), age)
        sample_at = point["sampleAtMs"]
        if stats["timeBasis"] == "source" and isinstance(sample_at, (int, float)) and sample_at > 0:
            age = reading["browserAtMs"] - sample_at
            if age >= 0:
                stats["maxSourceAgeMs"] = max(stats.get("maxSourceAgeMs", 0), age)
            else:
                stats["sourceClockAheadObservations"] = stats.get("sourceClockAheadObservations", 0) + 1


def observe(page, args, emit, summary):
    published_url, versions_url = endpoints(args.view)
    origin = (urlsplit(args.view).scheme, urlsplit(args.view).netloc)
    blocked = []
    script_errors = []

    def read_only(route):
        request = route.request
        uri = urlsplit(request.url)
        read_post = (
            request.method == "POST" and (uri.scheme, uri.netloc) == origin
            and uri.path in {"/api/sample", "/api/protocol/sample"}
        )
        if request.method in {"GET", "HEAD", "OPTIONS"} or read_post:
            route.continue_()
        else:
            blocked.append(request.method)
            route.abort()

    page.route("**/*", read_only)
    page.on("pageerror", lambda error: script_errors.append(True))
    initial_release = release_at(page, versions_url)
    summary["release"] = initial_release
    if getattr(args, "scope", "bench") == "field" and not (
        initial_release["documentMatches"] is True and
        initial_release["deploymentMatches"] is True and
        initial_release["documentHash"] and initial_release["deploymentHash"]
    ):
        raise RuntimeError("现场观察需要工程与运行文件均通过当前发布版核对")
    with page.expect_response(published_url, timeout=15000) as loaded:
        page.goto(args.view, wait_until="domcontentloaded", timeout=15000)
    published = loaded.value
    if not published.ok:
        raise RuntimeError(f"读取发布画面失败（HTTP {published.status}）")
    document_hash = hashlib.sha256(published.body()).hexdigest()
    if initial_release["documentHash"] and document_hash != initial_release["documentHash"]:
        raise RuntimeError("浏览器收到的工程与发布记录不一致")
    if release_at(page, versions_url) != initial_release:
        raise RuntimeError("打开画面期间发布版本发生变化")

    page.get_by_role("button", name="测点诊断", exact=True).click(timeout=10000)
    only_bad = page.get_by_role("checkbox", name="仅显示异常", exact=True)
    only_bad.uncheck(timeout=5000)
    document = published.json()
    page_id, expected_points = published_points(document, args.view)
    source = document["source"]
    source_timed_points = {mapping["id"] for mapping in document["mappings"] if mapping.get("timePath")}
    source_timed_points.update(id for id, (_, channel) in expected_points.items() if channel == "datasets")
    has_datasets = bool((source.get("datasets") or {}).get("bindings"))
    summary.update(documentSha256=document_hash, requestedPollMs=source["pollMs"],
                   pageId=page_id, sourceKind=source["kind"],
                   expectedPointCounts=Counter(channel for _, channel in expected_points.values()))
    loaded_view = page.url
    previous = first = None
    next_release_check = time.monotonic() + args.release_check_seconds
    while True:
        reading = probe(page)
        current = (time.monotonic(), time.time())
        first = first or current
        gap = observed_gap(previous, current) if previous else 0
        summary["maxObservationGapSeconds"] = round(max(summary["maxObservationGapSeconds"], gap), 3)
        if gap > args.max_gap_seconds:
            raise RuntimeError(f"观测缺口 {gap:.2f} 秒，超过本次设置的 {args.max_gap_seconds:g} 秒")
        if blocked or script_errors:
            raise RuntimeError("浏览器出现写入尝试或脚本异常")
        if page.url != loaded_view or reading["source"] != source["kind"] or bool(reading["datasetsLink"]) != has_datasets:
            raise RuntimeError("值守画面或数据源发生变化")
        verify_observed_points(reading, expected_points)
        elapsed = current[0] - first[0]
        summary["observations"] += 1
        summary["observedSeconds"] = round(elapsed, 3)
        summary["linkObservations"][reading["link"]] += 1
        summary["pointQualityObservations"].update(p["quality"] for p in reading["points"])
        observed_at = datetime.fromtimestamp(current[1], timezone.utc).isoformat()
        record_observation(summary, reading, source_timed_points, summary["observedSeconds"], observed_at)
        emit("observation", elapsedSeconds=summary["observedSeconds"], gapSeconds=round(gap, 3),
             observedAt=observed_at, **reading)
        if elapsed >= args.seconds or current[0] >= next_release_check:
            if release_at(page, versions_url) != initial_release:
                raise RuntimeError("值守期间发布版本或部署一致性发生变化")
            next_release_check = current[0] + args.release_check_seconds
        if elapsed >= args.seconds:
            return
        previous = current
        due = min(current[0] + args.interval_seconds, first[0] + args.seconds)
        # Keep Playwright dispatching routed reads between observations.
        page.wait_for_timeout(max(0, due - time.monotonic()) * 1000)


def write_summary(path, summary):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def run_monitor(args):
    args.out.mkdir(parents=True, exist_ok=False)
    summary = {
        "scope": args.scope, "observerPid": os.getpid(), "status": "starting",
        "requestedSeconds": args.seconds, "intervalSeconds": args.interval_seconds,
        "allowedGapSeconds": args.max_gap_seconds, "observations": 0, "observedSeconds": 0,
        "maxObservationGapSeconds": 0, "linkObservations": Counter(),
        "pointQualityObservations": Counter(),
    }
    next_report_at = 0
    progress = args.out / "progress.json"
    summary["updatedAt"] = datetime.now(timezone.utc).isoformat()
    write_summary(progress, summary)
    with (args.out / "observations.jsonl").open("w", encoding="utf-8") as log:
        def emit(event, **data):
            nonlocal next_report_at
            now = datetime.now(timezone.utc).isoformat()
            log.write(json.dumps({"utc": now, "event": event, **data}, ensure_ascii=False) + "\n")
            log.flush()
            if event == "observation" and summary["observedSeconds"] >= next_report_at:
                summary.update(status="running", updatedAt=now)
                write_summary(progress, summary)
                next_report_at = summary["observedSeconds"] + 60

        emit("started", scope=args.scope, requestedSeconds=args.seconds,
             intervalSeconds=args.interval_seconds, allowedGapSeconds=args.max_gap_seconds)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                try:
                    page = browser.new_page(viewport={"width": 1366, "height": 768})
                    observe(page, args, emit, summary)
                finally:
                    browser.close()
            summary["status"] = "completed"
        except (Exception, KeyboardInterrupt) as error:
            summary["status"] = "interrupted"
            summary["reason"] = str(error) or type(error).__name__
        emit(summary["status"], observedSeconds=summary["observedSeconds"], reason=summary.get("reason"))
    summary["updatedAt"] = datetime.now(timezone.utc).isoformat()
    write_summary(args.out / "results.json", summary)
    write_summary(progress, summary)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--view", required=True)
    parser.add_argument("--scope", choices=("bench", "field"), required=True)
    parser.add_argument("--seconds", type=float, required=True)
    parser.add_argument("--interval-seconds", type=float, default=15)
    parser.add_argument("--max-gap-seconds", type=float)
    parser.add_argument("--release-check-seconds", type=float, default=900)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if args.max_gap_seconds is None:
        args.max_gap_seconds = 2 * args.interval_seconds
    numeric = (args.seconds, args.interval_seconds, args.max_gap_seconds, args.release_check_seconds)
    if not all(0 < value < float("inf") for value in numeric) or args.max_gap_seconds < args.interval_seconds:
        parser.error("观测时长和间隔应为正数，最大缺口不得小于观测间隔")
    try:
        endpoints(args.view)
    except ValueError as error:
        parser.error(str(error))
    summary = run_monitor(args)
    print(json.dumps(summary, ensure_ascii=False))
    return int(summary["status"] != "completed")


if __name__ == "__main__":
    raise SystemExit(main())
