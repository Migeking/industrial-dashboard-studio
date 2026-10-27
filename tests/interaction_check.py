from pathlib import Path
from playwright.sync_api import sync_playwright
from scene_25_check import assert_scene_25


ROOT = Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def run_case(page, relative_path, action, assertion):
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto((ROOT / "scenarios" / relative_path).as_uri(), wait_until="networkidle")
    page.wait_for_timeout(500)
    action(page)
    page.wait_for_timeout(300)
    assertion(page)
    assert page.locator("#screen").count() == 1
    assert page.evaluate("document.querySelector('#screen').getBoundingClientRect().width") > 1300
    assert not errors, f"控制台错误: {errors}"
    print(f"[通过] {relative_path}")


def assert_agitator_axis(page):
    page.locator(".tabs button.active").filter(has_text="联锁演练").wait_for()
    page.locator(".safety-copy").filter(has_text="联锁动作").wait_for()
    blades = page.locator(".agitator-blades")
    samples = []
    for _ in range(6):
        box = blades.bounding_box()
        assert box
        samples.append(box)
        page.wait_for_timeout(180)
    centers = [box["x"] + box["width"] / 2 for box in samples]
    widths = [box["width"] for box in samples]
    assert max(centers) - min(centers) < 2, "搅拌器旋转轴发生横向漂移"
    assert max(widths) - min(widths) > 10, "搅拌器缺少竖轴旋转的投影变化"


def assert_ngt200_model(page):
    page.locator(".device-tile.selected").filter(has_text="BLW-02").wait_for()
    assert page.locator("#ngtModel canvas").count() == 1
    page.locator("#modeExterior").click()
    page.locator("#modeExterior.active").wait_for()
    page.locator("#modeCutaway").click()
    page.locator("#modeCutaway.active").wait_for()
    page.locator("#modeImpeller").click()
    page.locator("#modeImpeller.active").wait_for()
    assert page.locator(".frequency-strip").is_visible()


def assert_mbr_2p5d_interaction(page):
    page.locator(".asset-inspector strong").filter(has_text="好氧池").wait_for()
    page.locator(".kpi").first.locator("strong").filter(has_text="48.7").wait_for()
    assert page.locator(".scene-photo").evaluate(
        "img => img.complete && img.naturalWidth === 1672 && img.naturalHeight === 941"
    )
    assert page.locator(".scene-overlay .equipment").count() == 6
    assert page.locator('script[src*="three"]').count() == 0


def assert_settling_2p5d_interaction(page):
    page.locator(".asset-inspector strong").filter(has_text="沉淀处理池").wait_for()
    assert page.locator(".scene-photo").evaluate(
        "img => img.complete && img.naturalWidth === 1672 && img.naturalHeight === 941"
    )
    assert page.locator(".scene-overlay .equipment").count() == 6
    page.get_by_role("button", name="池体近景").click()
    page.locator(".plant.view-tanks").wait_for()
    page.locator(".scene-overlay .equipment").first.click()
    page.locator(".asset-inspector strong").filter(has_text="调节池").wait_for()
    page.get_by_role("button", name="设备近景").click()
    page.locator(".plant.view-equipment").wait_for()
    page.locator(".device").filter(has_text="加药设备").click()
    page.locator(".unit-focus b").filter(has_text="加药设备").wait_for()
    page.locator(".bottom-title").filter(has_text="药剂投加量趋势").wait_for()
    page.locator(".alarm-table tbody tr").filter(has_text="混凝剂余量").wait_for()
    page.get_by_role("button", name="沉淀效果关注").click()
    page.locator(".scene-overlay .equipment.warn").wait_for()
    page.locator(".alarm strong").filter(has_text="悬浮物偏高").wait_for()
    page.locator(".alarm").click()
    page.locator(".unit-focus b").filter(has_text="沉淀处理池").wait_for()
    assert page.locator('script[src*="three"]').count() == 0


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=CHROME)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.route("http://**/*", lambda route: route.abort())
    page.route("https://**/*", lambda route: route.abort())

    run_case(
        page,
        "water-treatment/01-A2O脱氮除磷精准调控驾驶舱.html",
        lambda p: p.get_by_role("button", name="高峰负荷").click(),
        lambda p: (
            p.locator(".scenario-tabs button.active").filter(has_text="高峰负荷").wait_for(),
            p.locator(".kpi").first.locator(".k-value").filter(has_text="86").wait_for(),
        ),
    )

    run_case(
        page,
        "predictive-maintenance/02-关键机组预测性维护驾驶舱.html",
        lambda p: p.locator(".device-tile").nth(1).click(),
        assert_ngt200_model,
    )

    run_case(
        page,
        "reactor-safety/03-反应釜热失控安全联锁舱.html",
        lambda p: p.get_by_role("button", name="联锁演练").click(),
        assert_agitator_axis,
    )

    run_case(
        page,
        "water-treatment/04-污泥回流泵联动控制驾驶舱.html",
        lambda p: p.get_by_role("button", name="洪峰增泵演练").click(),
        lambda p: (
            p.locator(".scenario-tabs button.active").filter(has_text="洪峰增泵演练").wait_for(),
            p.locator(".kpi").first.locator(".k-value").filter(has_text="3.86").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/06-A2O脱氮除磷SCADA操作终端.html",
        lambda p: (
            p.locator("g.device-interactive").nth(2).click(),
            p.locator(".faceplate-modal").wait_for(),
            p.locator(".slider-group button").click(),
            p.locator(".sbo-overlay").wait_for(),
            p.locator(".sbo-foot button").nth(1).click(),
        ),
        lambda p: (
            p.locator(".audit-table tbody tr").first.locator("td").nth(6).filter(has_text="两步确认通过").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/07-A2O脱氮除磷经典上位SCADA.html",
        lambda p: (
            p.locator("g.hmi-clickable").nth(2).click(),
            p.locator(".faceplate-window").wait_for(),
            p.locator(".bargraph-box").wait_for(),
            p.locator(".inch-btn-group button").nth(1).click(),
            p.locator(".fp-controls button:has-text('下发新设定')").click(),
            p.locator(".sbo-mask").wait_for(),
            p.locator(".sbo-foot button.danger").click(),
        ),
        lambda p: (
            p.locator(".bottom-drawer button:has-text('运行操作记录流水')").click(),
            p.locator(".alarm-table tbody tr").first.locator("td").nth(6).filter(has_text="SBO两步确认通过").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/08-预处理进水井3D交互HMI.html",
        lambda p: (
            p.locator(".equipment-row").first.click(),
            p.locator(".open-faceplate").click(),
            p.locator(".faceplate").wait_for(),
            p.locator(".command-btn.close").click(),
            p.locator(".sbo-mask").wait_for(),
            p.locator(".sbo-foot .confirm").click(),
            p.wait_for_timeout(1000),
            p.locator(".bottom-tabs button").nth(1).click(),
        ),
        lambda p: (
            p.locator(".audit-table tbody tr").first.locator("td").nth(7).filter(has_text="回读成功").wait_for(),
            p.locator(".audit-table tbody tr").first.locator("td").nth(5).filter(has_text="0.0%").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/09-预处理进水井浅色3D数字孪生HMI.html",
        lambda p: (
            p.locator(".valve-line").first.click(),
            p.locator(".control-tabs button").filter(has_text="控制").click(),
            p.locator(".control-buttons .close").click(),
            p.locator(".confirm-mask").wait_for(),
            p.locator(".confirm-actions .primary").click(),
        ),
        lambda p: (
            p.locator(".quick-cell").first.locator("b").filter(has_text="0.0").wait_for(),
            p.locator("#twin3d canvas").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/10-地下调蓄池水力冲洗数字孪生HMI.html",
        lambda p: (
            p.locator(".equipment-line").nth(2).click(),
            p.locator(".control-tabs button").filter(has_text="控制").click(),
            p.locator(".control-buttons .action-flush").click(),
            p.locator(".confirm-mask").wait_for(),
            p.locator(".confirm-actions .primary").click(),
        ),
        lambda p: (
            p.locator(".quick-cell").first.locator("b").filter(has_text="100.0").wait_for(),
            p.locator("#twin3d canvas").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/11-MBR膜生物反应池抽吸清洗数字孪生HMI.html",
        lambda p: (
            p.locator(".equipment-line").nth(1).click(),
            p.locator(".control-tabs button").filter(has_text="控制").click(),
            p.locator(".control-buttons button").filter(has_text="进入药洗维护模式").click(),
            p.locator(".confirm-mask").wait_for(),
            p.locator(".confirm-actions .primary").click(),
        ),
        lambda p: (
            p.locator(".phase-pill.cip").wait_for(),
            p.locator("#twin3d canvas").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/14-A2O生化处理2.5D工艺场景.html",
        lambda p: (
            p.get_by_role("button", name="曝气故障演练").click(),
            p.locator('[data-label="clarifier"]').click(),
            p.get_by_role("button", name="暂停动效").click(),
        ),
        lambda p: (
            p.locator(".status.warn").filter(has_text="曝气支路预警").wait_for(),
            p.locator(".panel-head h2").filter(has_text="二沉池").wait_for(),
            p.get_by_role("button", name="播放动效").wait_for(),
            p.locator("#scene3d canvas").wait_for(),
        ),
    )

    run_case(
        page,
        "process-control/15-连续分离工艺驾驶舱.html",
        lambda p: (
            p.get_by_role("button", name="冷却偏弱演练").click(),
            p.get_by_role("button", name="冷却循环", exact=True).click(),
            p.get_by_role("button", name="暂停动效").click(),
            p.get_by_role("button", name="查看塔顶冷凝器").click(),
            p.get_by_role("button", name="工艺作用").click(),
        ),
        lambda p: (
            p.locator(".health.warn").filter(has_text="冷却能力预警").wait_for(),
            p.locator(".inspector-title h2").filter(has_text="塔顶冷凝器").wait_for(),
            p.locator(".process-copy").filter(has_text="冷却介质").wait_for(),
            p.locator(".kpi.warn").filter(has_text="39.2").wait_for(),
            p.locator(".flow-route.cooling.focused").wait_for(),
            p.locator(".diagram.motion-paused").wait_for(),
        ),
    )

    run_case(
        page,
        "water-treatment/16-MBR膜池上位监控画面.html",
        lambda p: (
            p.get_by_role("button", name="选择好氧池").click(),
            p.get_by_role("button", name="膜压差关注").click(),
        ),
        assert_mbr_2p5d_interaction,
    )

    run_case(
        page,
        "water-treatment/17-污水处理沉淀单元2.5D上位画面.html",
        lambda p: None,
        assert_settling_2p5d_interaction,
    )

    def assert_water_network_interaction(page):
        page.locator(".panel-title").filter(has_text="园区供水管网拓扑与水流走向").wait_for()
        assert page.locator("#screen").count() == 1
        # 验证彻底无信号强度相关文本
        body_text = page.locator("body").inner_text()
        assert "信号质量" not in body_text, "看板中不应出现信号质量"
        assert "信号强度" not in body_text, "看板中不应出现信号强度"
        # 切换工况
        page.get_by_role("button", name="早间高峰").click()
        page.locator(".macro-val").first.filter(has_text="248.2").wait_for()
        # 点击节点弹出抽屉
        page.locator(".node-card").first.click()
        page.locator(".drawer").wait_for()
        assert page.locator(".dh-title h3").filter(has_text="普科1号楼").is_visible()
        page.locator(".btn-close").click()
        page.wait_for_timeout(200)

    run_case(
        page,
        "water-treatment/18-园区供水管网多节点平衡监控数字看板.html",
        lambda p: None,
        assert_water_network_interaction,
    )

    def assert_pam_dosing_interaction(page):
        page.locator(".panel-title").filter(has_text="三槽一体式加药装置").wait_for()
        assert page.locator("#screen").count() == 1
        page.get_by_role("button", name="熟化保温循环").click()
        page.locator(".macro-val").nth(1).filter(has_text="0").wait_for()
        page.get_by_role("button", name="+5%").click()
        page.locator(".ct-label strong").first.filter(has_text="70").wait_for()

    run_case(
        page,
        "water-treatment/19-PAM三槽式全自动加药熟化微单元.html",
        lambda p: None,
        assert_pam_dosing_interaction,
    )

    def assert_uv_disinfect_interaction(page):
        page.locator(".panel-title").filter(has_text="出水紫外线消毒接触明渠").wait_for()
        assert page.locator("#screen").count() == 1
        page.get_by_role("button", name="雨季高负荷调光").click()
        page.locator(".macro-val").first.filter(has_text="7200").wait_for()
        page.get_by_role("button", name="执行刮洗").click()
        page.locator(".wiper-row strong").first.filter(has_text="正在往复刮洗").wait_for()

    run_case(
        page,
        "water-treatment/20-紫外线渠式消毒与余氯闭环调控微单元.html",
        lambda p: None,
        assert_uv_disinfect_interaction,
    )

    def assert_coarse_screen_sump_interaction(page):
        page.locator(".brand-title").filter(has_text="粗格栅及进水提升泵房").wait_for()
        assert page.locator("#screen").count() == 1
        # 点击 1# 混流泵展开 Faceplate
        page.locator(".pump-group").first.click()
        page.locator(".faceplate-window").wait_for()
        assert page.locator("#radarCanvasBox canvas").count() == 1
        # 触发 SBO 防误确认
        page.locator(".fp-ctrl-btn.stop").click()
        page.locator(".sbo-box").wait_for()
        assert "SBO 两步防误确认" in page.locator(".sbo-header").inner_text()
        page.locator(".btn-sbo-yes").click()
        page.locator(".sbo-box").wait_for(state="detached")
        # 关闭 Faceplate
        page.locator(".fp-close-btn").click()
        page.locator(".faceplate-window").wait_for(state="detached")
        # 切换工况：汛期暴雨超量大流量
        page.get_by_role("button", name="汛期暴雨超量大流量").click()
        page.locator(".sump-level-pill").filter(has_text="13.80").wait_for()
        # 确认告警 (ACK)
        page.locator(".ack-btn-table").first.click()
        page.locator(".alarm-table td").filter(has_text="已确认").first.wait_for()

    run_case(
        page,
        "water-treatment/21-粗格栅及进水提升泵房数字孪生SCADA.html",
        lambda p: None,
        assert_coarse_screen_sump_interaction,
    )

    def assert_building_automation_22_interaction(p):
        assert p.locator("#threeViewport canvas").count() == 1
        assert p.locator(".echart-container canvas").count() == 2
        assert p.locator(".alarm-banner").is_visible()
        p.locator(".handle-btn").click()
        p.wait_for_timeout(300)
        assert "96" in p.locator(".comfort-val").inner_text()
        p.locator(".pill-btn").filter(has_text="2F").click()
        p.wait_for_timeout(300)
        assert "核心数据机房" in p.locator(".pill-btn.active").inner_text()

    run_case(
        page,
        "building-automation/22-智能楼宇自控与空间微气候数字孪生.html",
        lambda p: None,
        assert_building_automation_22_interaction,
    )

    def assert_dcs_local_hmi_23_interaction(p):
        assert p.locator("#screen").count() == 1
        p.locator(".card-header-bar h2").first.filter(has_text="1# 变频主供循环泵").wait_for()
        # 1. 测试威纶通触控弹出数字小键盘
        p.locator(".meter-box.settable").first.click()
        p.locator(".numpad-dialog").wait_for()
        p.locator(".np-key.func.clear").click()
        p.locator(".np-key").filter(has_text="4").first.click()
        p.locator(".np-key").filter(has_text="8").first.click()
        p.locator(".np-key").filter(has_text=".").first.click()
        p.locator(".np-key").filter(has_text="5").first.click()
        p.locator(".np-key.enter").click()
        p.locator(".numpad-dialog").wait_for(state="detached")
        p.locator(".meter-num.cyan").first.filter(has_text="48.5").wait_for()

        # 2. 测试点动微调 -0.5Hz / +0.5Hz
        p.locator(".btn-3d.btn-jog").filter(has_text="+0.5Hz").first.click()
        p.locator(".meter-num.cyan").first.filter(has_text="49.0").wait_for()

        # 3. 测试底栏 F 键画面切换 (F1 -> F3 报警 -> F4 趋势 -> F1)
        p.locator(".fkey-btn").filter(has_text="F3").click()
        p.locator(".alarm-grid-table").wait_for()
        p.locator(".fkey-btn").filter(has_text="F4").click()
        p.locator("#trendChart canvas").wait_for()
        p.locator(".fkey-btn").filter(has_text="F1").click()

        # 4. 测试旋钮切换至远程并闭锁
        p.locator(".knob-body").first.click()
        p.locator(".remote-lock-mask").wait_for()
        assert "受中央 DCS 远程锁定中" in p.locator(".remote-lock-mask").inner_text()
        p.locator(".remote-lock-mask button").click()
        p.locator(".remote-lock-mask").wait_for(state="detached")

        # 5. 测试物理级急停大蘑菇头拍下与释放
        p.locator(".estop-btn-wrap").click()
        p.locator(".estop-label").filter(has_text="急停已锁死").wait_for()
        p.locator(".estop-btn-wrap").click()
        p.locator(".estop-label").filter(has_text="就地急停").wait_for()

    def assert_biochemical_local_hmi_24_interaction(p):
        assert p.locator("#screen").count() == 1
        p.locator(".top-nav .unit-name").filter(has_text="生化反应池现场就地控制屏").wait_for()

        # 1. 测试推流机启停控制
        stop_btn = p.locator(".ctrl-module-box").first.locator(".btn-stop")
        start_btn = p.locator(".ctrl-module-box").first.locator(".btn-run")
        state_pill = p.locator(".ctrl-module-box").first.locator(".state-pill")

        # 点击停止
        stop_btn.click()
        state_pill.filter(has_text="已停机").wait_for()
        # 点击启动
        start_btn.click()
        state_pill.filter(has_text="运行中").wait_for()

        # 2. 测试曝气风阀大号步进微调 (+1% 与 +5%)
        valve_val = p.locator(".valve-current-val")
        orig_val = int(valve_val.inner_text())
        p.locator(".step-btn").filter(has_text="+5%").click()
        valve_val.filter(has_text=str(orig_val + 5)).wait_for()
        p.locator(".step-btn").filter(has_text="+1%").click()
        valve_val.filter(has_text=str(orig_val + 6)).wait_for()

        # 3. 测试好氧 DO 自动闭环恒定模式切换
        mode_btn = p.locator(".toggle-mode-btn")
        mode_btn.click()
        mode_btn.filter(has_text="模式: DO 自动闭环中").wait_for()
        # 自动模式下步进按钮禁用
        assert p.locator(".step-btn").first.is_disabled()
        # 再次点击切回手动步进
        mode_btn.click()
        mode_btn.filter(has_text="模式: 手动步进微调").wait_for()

        # 4. 测试现场就地/远程旋钮切换与回路闭锁
        p.locator(".mode-rotary-box").click()
        p.locator(".console-lock-mask").wait_for()
        assert "现场就地控制回路已锁定" in p.locator(".lock-headline").inner_text()
        p.locator(".console-lock-mask button").click()
        p.locator(".console-lock-mask").wait_for(state="detached")

        # 5. 测试物理级急停大按键拍下与复位
        estop_btn = p.locator(".estop-huge-btn")
        estop_btn.click()
        estop_btn.filter(has_text="急停已锁死").wait_for()
        estop_btn.click()
        estop_btn.filter(has_text="就地急停").wait_for()

    def assert_sludge_dewatering_25_interaction(p):
        assert_scene_25(p)

    run_case(
        page,
        "water-treatment/25-污泥浓缩脱水全流程智能监控中心.html",
        lambda p: None,
        assert_sludge_dewatering_25_interaction,
    )

    def assert_cso_v6_odor_interaction(p):
        assert p.locator("#screen").count() == 1
        assert p.locator("#cc-fan-tag-1").is_visible()
        # 测试点击除臭间气体逸散超标联动
        p.locator("#scen-cc-leak").click()
        p.wait_for_timeout(300)
        assert "12.8" in p.locator("#cc-h2s-val").inner_text()
        # 测试复常延时停机倒计时
        p.locator("#scen-reset").click()
        p.wait_for_timeout(300)
        assert "延时停机中" in p.locator("#delay-timer-label").inner_text()

    run_case(
        page,
        "custom-cso/05-cso-ss02-odor-safety-ventilation.html",
        lambda p: None,
        assert_cso_v6_odor_interaction,
    )

    def assert_water_quality_cockpit_26_interaction(p):
        assert p.locator("#screen").count() == 1
        title_text = p.locator(".title-wrap .title").inner_text().replace('\n', '').replace(' ', '')
        assert "东湖水质预测智能驾驶舱" in title_text

        # 1. 等待开屏 HUD Loader 结束，主面板加载完毕
        p.locator(".prop-panel").wait_for(timeout=15000)

        # 2. 测试左翼指标卡切换
        p.locator(".prop-card").filter(has_text="出水TP").click()
        p.locator(".prop-card.active").filter(has_text="出水TP").wait_for(timeout=3000)
        assert p.locator(".prop-card.active").filter(has_text="出水TP").count() == 1

        # 3. 测试右下角 AquaAgent 水灵助手唤醒球点击与抽屉展开
        p.locator(".agent-fab").click()
        p.locator(".agent-drawer").wait_for(timeout=3000)
        assert "水灵" in p.locator(".agent-title").inner_text()

        # 4. 测试文字对话输入与智能研判问答
        p.locator(".input-wrap input").fill("出水COD趋势如何")
        p.locator(".btn-send").click()
        p.locator(".agent-msg-item.user").filter(has_text="出水COD趋势如何").wait_for(timeout=3000)
        p.locator(".agent-msg-item.assistant").last.wait_for(timeout=3000)

        # 5. 关闭水灵抽屉
        p.locator(".close-btn").click()
        p.locator(".agent-drawer").wait_for(state="detached", timeout=3000)

        # 6. 测试右下角模拟波动微调按钮
        p.locator(".mock-toolbox button").filter(has_text="模拟波动").click()

    run_case(
        page,
        "water-treatment/26-东湖智慧水质时序预测与Aqua-Agent数字驾驶舱.html",
        lambda p: None,
        assert_water_quality_cockpit_26_interaction,
    )

    def assert_blower_house_27_interaction(p):
        assert p.locator("#screen").count() == 1
        p.locator(".brand-title").filter(has_text="曝气鼓风机房").wait_for()
        assert p.locator("#chartTrend canvas").count() == 1
        assert p.locator("#chartGauge canvas").count() == 1
        assert p.locator("#chartCompare canvas").count() == 1
        # 切换高峰负荷工况
        p.get_by_role("button", name="高峰负荷").click()
        p.locator(".scenario-tabs button.active").filter(has_text="高峰负荷").wait_for()
        p.locator(".kpi").first.locator(".k-value").filter(has_text="4.62").wait_for()
        # 点击 1# 鼓风机弹出 Faceplate
        p.locator(".blower-unit").first.click()
        p.locator(".faceplate").wait_for()
        assert "Hz" in p.locator(".faceplate").inner_text()
        # DO 目标步进 +1
        p.locator(".do-plus").click()
        p.locator(".do-target").filter(has_text="2.3").wait_for()
        # 告警确认
        p.locator(".ack-btn").first.click()
        p.locator(".alarm-table td").filter(has_text="已确认").first.wait_for()

    run_case(
        page,
        "water-treatment/27-曝气鼓风机房智能供风能效驾驶舱.html",
        lambda p: None,
        assert_blower_house_27_interaction,
    )

    def assert_blower_local_panel_28(p):
        assert "未接现场 I/O" in p.locator(".demo-badge").inner_text()
        assert p.locator(".status-value").first.filter(has_text="停机").count() == 1
        assert p.locator(".impeller").evaluate("e => getComputedStyle(e).animationName") == "none"
        assert p.locator(".frequency-reading").first.locator("strong").inner_text().startswith("40.0")
        assert p.locator(".frequency-reading.feedback strong").inner_text().startswith("—.—")
        assert p.locator(".current-cell strong").all_inner_texts() == ["—.—", "—.—", "—.—"]

        p.get_by_role("button", name="频率加 0.5 赫兹").click()
        assert p.locator(".frequency-reading").first.locator("strong").inner_text().startswith("40.5")

        p.get_by_role("button", name="启动").click()
        p.locator(".status-value").first.filter(has_text="运行").wait_for()
        assert p.locator(".impeller.is-rotating").count() == 1
        assert p.locator(".impeller").evaluate("e => getComputedStyle(e).animationName") == "blower-impeller-spin"
        spin_transform_start = p.locator(".impeller").evaluate("e => getComputedStyle(e).transform")
        p.wait_for_timeout(300)
        spin_transform_end = p.locator(".impeller").evaluate("e => getComputedStyle(e).transform")
        assert spin_transform_start != spin_transform_end
        assert p.locator(".frequency-reading.feedback strong").inner_text().startswith("40.5")
        assert p.locator(".current-cell strong").all_inner_texts() == ["12.4", "12.1", "12.3"]
        p.get_by_role("button", name="停止").click()
        p.locator(".status-value").first.filter(has_text="停机").wait_for()
        assert p.locator(".impeller.is-rotating").count() == 0
        assert p.locator(".impeller").evaluate("e => getComputedStyle(e).animationName") == "none"
        assert p.locator(".frequency-reading.feedback strong").inner_text().startswith("—.—")

        p.get_by_role("button", name="远程 REMOTE").click()
        assert p.get_by_role("button", name="启动").is_disabled()
        assert p.get_by_role("button", name="停止").is_disabled()
        assert p.get_by_role("button", name="故障复位").is_disabled()
        assert p.get_by_role("button", name="频率加 0.5 赫兹").is_disabled()

        p.get_by_role("button", name="注入演示故障").click()
        p.locator(".status-value").first.filter(has_text="故障锁存").wait_for()
        assert "不会自动重启" in p.locator(".command-help").inner_text()
        assert p.get_by_role("button", name="故障复位").is_disabled()
        assert p.get_by_role("button", name="频率减 0.5 赫兹").is_disabled()
        p.get_by_role("button", name="就地 LOCAL").click()
        p.get_by_role("button", name="故障复位").click()
        p.locator(".status-value").first.filter(has_text="停机").wait_for()
        assert p.get_by_role("button", name="启动").is_enabled()
        assert p.get_by_role("button", name="频率加 0.5 赫兹").is_enabled()

        p.set_viewport_size({"width": 1024, "height": 768})
        p.wait_for_timeout(300)
        compact = p.locator("#screen").bounding_box()
        assert compact and compact["width"] == 1024 and compact["height"] == 768
        for selector in [".frequency-panel", ".command-grid", ".signal-panel", ".bottom-bar"]:
            assert p.locator(selector).is_visible(), selector
        operator = p.locator(".operator-panel").bounding_box()
        help_box = p.locator(".command-help").bounding_box()
        assert operator and help_box and help_box["y"] + help_box["height"] <= operator["y"] + operator["height"]
        signals = p.locator(".signal-panel").bounding_box()
        inject = p.locator(".demo-inject").bounding_box()
        assert signals and inject and inject["y"] + inject["height"] <= signals["y"] + signals["height"]
        p.set_viewport_size({"width": 1920, "height": 1080})

    run_case(
        page,
        "water-treatment/28-曝气鼓风机就地控制屏.html",
        lambda p: None,
        assert_blower_local_panel_28,
    )

    showcase = browser.new_page(viewport={"width": 1440, "height": 900})
    showcase.route("http://**/*", lambda route: route.abort())
    showcase.route("https://**/*", lambda route: route.abort())
    showcase.goto((ROOT / "apps" / "showcase" / "index.html").as_uri(), wait_until="networkidle")
    assert showcase.locator(".card").count() == 30
    latest_card = showcase.locator('.card[data-src*="30-"]')
    latest_card.scroll_into_view_if_needed()
    assert latest_card.is_visible()
    latest_card.click()
    assert "多建筑" in showcase.locator("#stageTitle").inner_text()
    portrait = browser.new_page(viewport={"width": 390, "height": 844})
    portrait.goto((ROOT / "apps" / "showcase" / "index.html").as_uri(), wait_until="domcontentloaded")
    assert portrait.locator(".rotate").is_visible()
    print("[通过] 横屏入口与离线资源加载")
    browser.close()
