"""Observe a published SCADA view and record continuous read-only trial evidence."""
import argparse
import hashlib
import json
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
            quality: row.dataset.monitorQuality,
            reason: row.dataset.monitorReason || null,
            sampleAtMs: number(row.dataset.monitorSampleAt),
            receivedAtMs: number(row.dataset.monitorReceivedAt),
        }));
        const trendHosts = [...document.querySelectorAll('[data-shape="screen-trend"] .screen-chart-host')];
        return {
            link: badge.dataset.monitorLink,
            source: badge.dataset.monitorSource,
            maxAgeMs: number(badge.dataset.monitorMaxAge),
            nodes: document.querySelectorAll('.x6-node').length,
            pipes: document.querySelectorAll('.x6-edge').length,
            trendSamples: trendHosts.map(host => globalThis.echarts?.getInstanceByDom(host)
                ?.getOption()?.series?.map(series => series.data?.length || 0) || []),
            renderedEventRows: [...document.querySelectorAll('[data-shape="screen-events"] .screen-table-host tbody')]
                .map(body => body.rows.length),
            points,
        };
    }""")
    if result["source"] not in {"rest", "ws", "opcua", "modbus"}:
        raise RuntimeError("当前工程使用本地样本，连续值守需使用网络数据源")
    if not result["points"] or not result["nodes"]:
        raise RuntimeError("监视画面没有可观测的绑定测点")
    return result


def observed_gap(previous, current):
    return max(current[0] - previous[0], current[1] - previous[1])


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
    summary.update(release=initial_release, documentSha256=document_hash)
    previous = first = None
    next_release_check = time.monotonic() + args.release_check_seconds
    expected_points = None
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
        keys = {p["id"] for p in reading["points"]}
        if expected_points is not None and keys != expected_points:
            raise RuntimeError("画面内的测点集合发生变化")
        expected_points = keys
        elapsed = current[0] - first[0]
        summary["observations"] += 1
        summary["observedSeconds"] = round(elapsed, 3)
        summary["linkObservations"][reading["link"]] += 1
        summary["pointQualityObservations"].update(p["quality"] for p in reading["points"])
        emit("observation", elapsedSeconds=summary["observedSeconds"], gapSeconds=round(gap, 3), **reading)
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
    args.out.mkdir(parents=True, exist_ok=False)
    summary = {
        "scope": args.scope, "requestedSeconds": args.seconds, "intervalSeconds": args.interval_seconds,
        "allowedGapSeconds": args.max_gap_seconds, "observations": 0, "observedSeconds": 0,
        "maxObservationGapSeconds": 0, "linkObservations": Counter(),
        "pointQualityObservations": Counter(),
    }
    with (args.out / "observations.jsonl").open("w", encoding="utf-8") as log:
        def emit(event, **data):
            row = {"utc": datetime.now(timezone.utc).isoformat(), "event": event, **data}
            log.write(json.dumps(row, ensure_ascii=False) + "\n")
            log.flush()

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
    (args.out / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return int(summary["status"] != "completed")


if __name__ == "__main__":
    raise SystemExit(main())
