"""Compile the two reviewed originals into editable, declarative scene graphs.

This is a migration tool, not a browser HTML/JavaScript importer. Unsupported
expressions fail the build. The runtime accepts only finite value/action rules.
Run: python -X utf8 scripts/build_studio_templates.py
"""
import copy
import hashlib
import json
import re
import subprocess
from pathlib import Path

from bs4 import BeautifulSoup, Comment, NavigableString

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'packages/components/studio/native-data.mjs'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
PUMP_IDS = ['05-pump-' + str(i + 1) for i in range(4)]
PUMP_SLOTS = {'running': 'run', 'autoMode': 'auto', 'hz': 'frequency', 'current': 'current', 'fault': 'fault'}


def js_object(code):
    result = subprocess.run(['node', '-e', "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(require('node:vm').runInNewContext('('+s+')'))));"], input=code, text=True, capture_output=True, check=True, encoding='utf-8')
    return json.loads(result.stdout)


def chart_options(source):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        page.goto(source.as_uri())
        page.wait_for_function("echarts.getInstanceByDom(document.getElementById('loadChart'))")
        result = page.evaluate("""()=>{const r={};for(const id of ['loadChart','controlChart']){const o=echarts.getInstanceByDom(document.getElementById(id)).getOption();r[id]={};for(const k of ['grid','tooltip','legend','xAxis','yAxis','series'])r[id][k]=o[k];}return r;}""")
        browser.close()
    return result


class Compiler:
    def __init__(self, sid, source, charts):
        self.sid, self.source, self.charts = sid, source, charts
        self.nodes, self.by_id, self.data, self.maps = [], {}, {}, {}
        self.serial = 0
        self.soup = BeautifulSoup(source.read_text(encoding='utf-8'), 'html.parser')
        self.original = source.read_text(encoding='utf-8')
        self.modes = []
        if sid == '01':
            modes = js_object(re.search(r'const scenarioData=(.*?);\s*const app', self.original, re.S)[1])
            labels = {'stable': '标准稳态', 'peak': '高峰负荷', 'lowtemp': '低温补偿'}
            self.modes = [{'id': k, 'label': labels[k], 'data': v} for k, v in modes.items()]
            units = {'flow': 'm³/h', 'temp': '℃', 'external': '%', 'internal': '%', 'carbon': 'L/h', 'removal': '%', 'orp': 'mV', 'doAnoxic': 'mg/L', 'doAerobic': 'mg/L', 'pumpHz': 'Hz', 'blowerHz': 'Hz'}
            names = {'flow': '当前处理量', 'temp': '生化池水温', 'external': '外回流比', 'internal': '内回流比', 'carbon': '碳源投加量', 'removal': '总氮去除率', 'orp': '厌氧池ORP', 'doAnoxic': '缺氧池DO', 'doAerobic': '好氧池DO', 'pumpHz': '内回流泵频率', 'blowerHz': '鼓风机频率', 'status': '运行态势', 'statusText': '态势说明', 'advice': '调控建议'}
            for key, value in modes['stable'].items():
                self.point(key, value, names[key], units.get(key, ''), 2 if key.startswith('do') else 1 if key == 'temp' else 0)
            self.compliance = [{'name': 'COD', 'value': 23.6, 'rate': 78, 'color': '#35d07f'}, {'name': 'NH₄-N', 'value': 1.2, 'rate': 91, 'color': '#35d07f'}, {'name': 'TN', 'value': 12.4, 'rate': 83, 'color': '#35d07f'}, {'name': 'TP', 'value': .38, 'rate': 76, 'color': '#36c2ff'}]
            for i, row in enumerate(self.compliance):
                self.point('quality' + str(i), row['value'], '出水 ' + row['name'], 'mg/L', 2 if i == 3 else 1)
        else:
            for key, val, label, unit, precision in [('level', 3.24, '集泥井液位PV', 'm', 2), ('setpoint', 3.2, '液位设定SP', 'm', 2), ('command', 38.5, '主令频率', 'Hz', 1), ('demand', 2, '需求泵数', '台', 0), ('alarmLevel', '高危报警', '报警等级', '', 0), ('alarmMessage', '2# 污泥回流泵轴承温度轻微偏高 (43.8 ℃)，请保持监视。', '报警内容', '', 0)]:
                self.point(key, val, label, unit, precision)
            for i in range(4):
                for key, val in [('run', i < 2), ('fault', False), ('auto', True), ('frequency', 38.5 if i < 2 else 0), ('current', [18.2, 18, 0, 0][i])]:
                    self.point('P' + str(i+1) + '.' + key, val, str(i+1) + '#回流泵 ' + {'run': '运行', 'fault': '故障', 'auto': '自动模式', 'frequency': '频率', 'current': '电流'}[key], 'Hz' if key == 'frequency' else 'A' if key == 'current' else '', 1)

    def point(self, key, val, label=None, unit='', precision=0):
        if isinstance(val, str) and re.fullmatch(r'-?\d+(\.\d+)?', val):
            val = float(val) if '.' in val else int(val)
        self.data[key] = val
        self.maps[key] = {'id': key, 'label': label or key, 'path': key, 'kind': 'dataset' if isinstance(val, list) else 'boolean' if isinstance(val, bool) else 'number' if isinstance(val, (int, float)) else 'text', 'unit': unit, 'precision': precision, 'scale': 1, 'offset': 0}
        return {'point': key}

    def ref(self, key):
        assert key in self.maps, key
        return {'point': key}

    def pump_ref(self, idx, key):
        return {'node': PUMP_IDS[idx], 'slot': PUMP_SLOTS.get(key, key)}

    def value(self, expression, ctx):
        e = expression.strip()
        if e.startswith('current.'):
            return self.ref(e[8:])
        if e in ('clock', 'date'):
            return {'runtime': e}
        if e == 'item.label':
            return ctx['item']['label']
        if e == 'm.name':
            return ctx['m']['name']
        if e == 'm.value':
            return self.ref('quality' + str(ctx['mi']))
        if e == 'p.id':
            return 'P-0' + str(ctx['idx'] + 1)
        if e == "p.autoMode ? '自动' : '手动'":
            return {'op': 'enum', 'input': self.pump_ref(ctx['idx'], 'autoMode'), 'values': {'true': '自动', 'false': '手动'}}
        if e == "p.running ? p.hz.toFixed(1) + 'Hz' : '停机'":
            return {'op': 'runningValue', 'run': self.pump_ref(ctx['idx'], 'running'), 'fault': self.pump_ref(ctx['idx'], 'fault'), 'input': self.pump_ref(ctx['idx'], 'hz'), 'precision': 1, 'suffix': 'Hz'}
        if e.startswith("tags['SR.SUMP.LT101."):
            return {**self.ref('level' if '.PV' in e else 'setpoint'), 'precision': 2}
        if e in ('fcmd.toFixed(1)', 'demandCount'):
            return {**self.ref('command' if e.startswith('fcmd') else 'demand'), 'precision': 1 if e.startswith('fcmd') else 0}
        if e == 'totalFlow':
            return self.point('totalFlow', 684, '回流总流量', 'm³/h', 0)
        if e == 'runningCount':
            return {'op': 'runningCount', 'devices': PUMP_IDS, 'scale': 1}
        if e.startswith('currentAlarm ? currentAlarm.'):
            return self.ref('alarmLevel' if '.level' in e else 'alarmMessage')
        if e == 'auditLogs.length':
            return {'runtime': 'auditCount'}
        raise ValueError('Unsupported text expression: ' + e)

    def bind_spec(self, spec, node):
        if isinstance(spec, dict):
            if 'point' in spec:
                source = spec['point']
                slot = 'value' if not node['bindings'] else 'value' + str(len(node['bindings']) + 1)
                node['bindings'][slot] = source
                node['slots'].append({'key': slot, 'label': self.maps[source]['label'], 'kind': self.maps[source]['kind'], 'required': True})
                return {**{k: v for k, v in spec.items() if k != 'point'}, 'node': node['id'], 'slot': slot}
            return {k: self.bind_spec(v, node) for k, v in spec.items()}
        if isinstance(spec, list):
            return [self.bind_spec(v, node) for v in spec]
        return spec

    def condition(self, expression, ctx):
        e = expression.strip()
        if e == 'runningCount > 0':
            return {'op': 'positive', 'input': self.value('runningCount', ctx)}
        if e == 'p.running':
            return self.pump_ref(ctx['idx'], 'running')
        m = re.fullmatch(r'pumps\[(\d)\]\.running', e)
        if m:
            return self.pump_ref(int(m[1]), 'running')
        raise ValueError('Unsupported condition: ' + e)

    def build(self, el, parent=None, ctx=None):
        ctx = ctx or {}
        if isinstance(el, Comment):
            return []
        if isinstance(el, NavigableString):
            text = re.sub(r'\s+', ' ', str(el))
            if not text.strip():
                return []
            parts = []
            for part in re.split(r'({{.*?}})', text):
                if not part:
                    continue
                parts.append(self.bind_spec(self.value(part[2:-2], ctx), parent) if part.startswith('{{') else part)
            return parts
        if 'faceplate-modal' in el.get('class', []) or 'sbo-overlay' in el.get('class', []):
            return []
        loop = el.get('v-for')
        if loop:
            if loop == 'item in scenarios':
                values = [{'item': m} for m in self.modes]
            elif loop == 'm in compliance':
                values = [{'m': m, 'mi': i} for i, m in enumerate(self.compliance)]
            elif loop == '(p, idx) in pumps':
                values = [{'idx': i, 'pump': True} for i in range(4)]
            elif loop == '(log, idx) in auditLogs':
                return []  # The enclosing tbody is rendered from the audit dataset.
            else:
                raise ValueError(loop)
            output = []
            for sub in values:
                clone = copy.copy(el)
                clone.attrs = dict(el.attrs)
                del clone.attrs['v-for']
                output.extend(self.build(clone, parent, {**ctx, **sub}))
            return output
        self.serial += 1
        nid = self.sid + '-n' + str(self.serial)
        if ctx.get('pump'):
            nid = PUMP_IDS[ctx['idx']]
            ctx = {**ctx, 'pump': False}
        attrs = {}
        svg_names = {'viewbox': 'viewBox', 'preserveaspectratio': 'preserveAspectRatio', 'gradientunits': 'gradientUnits'}
        for key, val in el.attrs.items():
            if key.startswith((':', '@', 'v-')):
                continue
            attrs[svg_names.get(key, key)] = ' '.join(val) if isinstance(val, list) else val
        if el.get('id') == 'screen':
            attrs['id'] = 'screen'
        tag = {'lineargradient': 'linearGradient', 'fegaussianblur': 'feGaussianBlur', 'femerge': 'feMerge', 'femergenode': 'feMergeNode'}.get(el.name, el.name)
        node = {'id': nid, 'parentId': parent['id'] if parent else None, 'type': 'element', 'tag': tag, 'attrs': attrs, 'title': '', 'content': [], 'bindings': {}, 'slots': [], 'layout': {}, 'style': {}}
        self.nodes.append(node)
        self.by_id[nid] = node
        cls = attrs.get('class', '').split()
        plain = re.sub(r'{{.*?}}', '', el.get_text(' ', strip=True)).strip()
        node['title'] = plain[:36] or (cls[0] if cls else el.name)
        node['editable'] = bool(set(cls) & {'panel', 'kpi', 'micro-card', 'status-hero', 'equipment', 'alarm-item', 'compliance-row', 'decision', 'action', 'topbar', 'statusbar', 'audit-bar', 'alarm-banner', 'schematic-wrapper'}) or el.name in ('text', 'path', 'button') or (not el.find() and bool(plain))
        if nid in PUMP_IDS:
            i = PUMP_IDS.index(nid)
            node.update(title='P-0' + str(i+1) + ' 回流泵', editable=True, role='device')
            node['bindings'] = {v: 'P' + str(i+1) + '.' + v for v in PUMP_SLOTS.values()}
            node['slots'] = [{'key': v, 'label': {'run': '运行反馈', 'fault': '故障反馈', 'auto': '自动模式', 'frequency': '频率', 'current': '电流'}[v], 'kind': 'boolean' if v in ('run', 'fault', 'auto') else 'number', 'required': True} for v in PUMP_SLOTS.values()]
        click = el.get('@click')
        if click:
            node['editable'] = True
            if click.startswith('applyScenario'):
                node['title'] = ctx['item']['label']
                node['action'] = {'type': 'scenario', 'target': ctx['item']['id']}
            elif click.startswith('openPumpFaceplate'):
                node['action'] = {'type': 'faceplate', 'target': PUMP_IDS[ctx['idx']]}
            elif click == 'openPidFaceplate':
                node['action'] = {'type': 'pid'}
            elif click in ('silenceAlarm', 'ackAlarm'):
                node['action'] = {'type': 'silence' if click == 'silenceAlarm' else 'ack'}
            else:
                raise ValueError(click)
        node['rules'] = {}
        for key, val in el.attrs.items():
            if not key.startswith(':') or key == ':key':
                continue
            if key == ':class':
                if val == "'mode-'+scenario":
                    rule = {'op': 'modeClass'}
                elif val == '{active:scenario===item.id}':
                    rule = {'op': 'scenarioClass', 'target': ctx['item']['id']}
                elif val == "current.doAerobic<2?'warn-dot':'equipment-dot'":
                    rule = {'op': 'oxygenClass', 'input': self.ref('doAerobic')}
                elif val == '{ack: alarmAcknowledged}':
                    rule = {'runtime': 'alarmClass'}
                elif val == '{running: p.running, fault: p.fault}':
                    rule = {'op': 'pumpClass', 'run': self.pump_ref(ctx['idx'], 'running'), 'fault': self.pump_ref(ctx['idx'], 'fault')}
                else:
                    m = re.fullmatch(r"\['pipe-base', (.*?) \? 'pipe-flow' : 'pipe-flow stop'\]", val)
                    if not m:
                        raise ValueError(val)
                    rule = {'op': 'flowClass', 'input': self.condition(m[1], ctx)}
                node['rules']['class'] = self.bind_spec(rule, node)
            elif key == ':style':
                assert 'm.rate' in val, val
                attrs['style'] = 'width:' + str(ctx['m']['rate']) + '%;--bar:' + ctx['m']['color']
            elif key == ':transform':
                attrs['transform'] = 'translate(0,' + str(ctx['idx'] * 80) + ')'
            elif key in (':y', ':height'):
                node['rules'][key[1:]] = self.bind_spec({'op': 'linear', 'input': self.ref('level'), 'scale': -60 if key == ':y' else 60, 'offset': 384 if key == ':y' else 0}, node)
            else:
                raise ValueError(key + '=' + str(val))
        if el.get('v-if') not in (None, 'currentAlarm'):
            raise ValueError(el.get('v-if'))
        if self.sid == '05' and el.name == 'tbody':
            node['role'] = 'auditRows'
        elif el.get('id') in self.charts:
            node['type'] = 'trend'
            node['title'] = '进水负荷与总氮趋势' if el['id'] == 'loadChart' else '碳源投加与出水TN趋势'
            node['editable'] = True
            option = copy.deepcopy(self.charts[el['id']])
            series = []
            for i, s in enumerate(option['series']):
                key = el['id'] + '.series' + str(i)
                values = [{'time': t, 'value': v} for t, v in zip(option['xAxis'][0]['data'], s['data'])]
                self.point(key, values, s['name'] + ' 历史序列')
                node['bindings']['series' + str(i)] = key
                node['slots'].append({'key': 'series' + str(i), 'label': s['name'], 'kind': 'series', 'required': True})
                s.pop('data', None)
                series.append({'slot': 'series' + str(i), 'name': s['name'], 'type': s['type'], 'axis': s.get('yAxisIndex', 0), 'precision': 1})
            node['chart'] = {'options': option, 'series': series}
        else:
            for child in el.children:
                node['content'].extend(self.build(child, node, ctx))
        # Make source/quality messages truthful without changing the layout.
        if self.sid == '01' and 'statusbar' in cls:
            node['role'] = 'statusbar'
        if node['bindings'] and node['title'] in ('div', 'strong', 'span', 'text'):
            node['title'] = node['slots'][0]['label']
        return [{'child': nid}]

    def compile(self):
        self.build(self.soup.select_one('#screen'))
        if self.sid == '01':
            metrics = {'5.2 mg/L': ('phosphate', 5.2, '正磷酸盐', 'mg/L', 1), '6.8 mg/L': ('nitrate', 6.8, '缺氧池NO₃-N', 'mg/L', 1), '1.8 mg/L': ('ammonia', 1.8, '好氧池NH₄-N', 'mg/L', 1), '3.32 g/L': ('mlss', 3.32, '污泥浓度MLSS', 'g/L', 2), '1.18 m': ('sludgeLevel', 1.18, '二沉池泥位', 'm', 2)}
            for n in self.nodes:
                text = ''.join(p for p in n['content'] if isinstance(p, str)).strip()
                if text in metrics and 'metric-value' in n['attrs'].get('class', ''):
                    key, val, name, unit, precision = metrics[text]
                    n['content'] = [self.bind_spec(self.point(key, val, name, unit, precision), n), ' ' + unit]
                if 'bindings' in n and n['bindings']:
                    n['editable'] = True
                    n['title'] = n['slots'][0]['label']
            def branch(root):
                result = [root]
                for p in root['content']:
                    if isinstance(p, dict) and 'child' in p: result.extend(branch(self.by_id[p['child']]))
                return result
            for index, equipment in enumerate(n for n in self.nodes if 'equipment' in n['attrs'].get('class', '').split()):
                rows = branch(equipment)
                label = next((n['content'][0] for n in rows if n['tag'] == 'b'), '设备')
                equipment.update(title=label, role='equipment')
                for key, val, name in [('run', True, '运行反馈'), ('fault', False, '故障反馈')]:
                    source = 'equipment' + str(index+1) + '.' + key
                    self.point(source, val, label + ' ' + name)
                    equipment['bindings'][key] = source
                    equipment['slots'].append({'key': key, 'label': name, 'kind': 'boolean', 'required': True})
                hz = next(n for n in rows if 'hz' in n['attrs'].get('class', '').split())
                value = ['pumpHz', 'externalPumpHz', 'blowerHz', 'carbon'][index]
                if value not in self.maps: self.point(value, 31, '外回流泵频率', 'Hz', 0)
                equipment['bindings']['value'] = value
                equipment['slots'].append({'key': 'value', 'label': '投加量' if index == 3 else '频率', 'kind': 'number', 'required': True})
                hz['bindings'], hz['slots'] = {}, []
                hz['content'] = [{'node': equipment['id'], 'slot': 'value'}] + ([] if index == 3 else [' Hz'])
                state = next(n for n in rows if 'state' in n['attrs'].get('class', '').split())
                spec = {'op': 'equipmentState', 'run': {'node': equipment['id'], 'slot': 'run'}, 'fault': {'node': equipment['id'], 'slot': 'fault'}, 'notice': index == 3}
                state['content'] = [spec]
                state['rules']['class'] = {**spec, 'op': 'equipmentClass'}
            removed = set()
            for n in self.nodes:
                text = ''.join(p for p in n['content'] if isinstance(p, str)).strip()
                if text == '48/48': n['content'] = [self.bind_spec(self.point('instruments', '48/48', '在线仪表'), n)]
                if text == '0.8 s': n['content'] = [self.bind_spec(self.point('latency', .8, '数据时延', 's', 1), n), ' s']
                if 'alarm-list' in n['attrs'].get('class', '').split():
                    events = [{'title': '缺氧池硝酸盐轻微偏高', 'detail': '建议内回流比上调 5%，观察 15 分钟', 'time': '17:22', 'level': 'warning'}, {'title': '出水 TN 稳定达标', 'detail': '连续 8 小时低于 13 mg/L', 'time': '17:18', 'level': 'normal'}, {'title': '在线仪表质量正常', 'detail': '48 个测点质量 GOOD', 'time': '17:15', 'level': 'normal'}]
                    self.point('events', events, '当前事件列表')
                    n['role'] = 'events'; n['title'] = '当前事件列表'; n['bindings']['rows'] = 'events'; n['slots'].append({'key': 'rows', 'label': '事件数据集', 'kind': 'dataset', 'required': True})
                    removed.update(child['id'] for child in branch(n) if child['id'] != n['id'])
                    n['content'] = []
                    n['editable'] = True
            self.nodes = [n for n in self.nodes if n['id'] not in removed]
            events_node = next(n for n in self.nodes if n.get('role') == 'events')
            for n in self.nodes:
                if n['content'] == ['1 条关注']: n['content'] = [{'op': 'eventCount', 'input': {'node': events_node['id'], 'slot': 'rows'}}]
        if self.sid == '05':
            setpoint = next(n for n in self.nodes if n['bindings'].get('value') == 'setpoint')
            for n in self.nodes:
                if n.get('action', {}).get('type') == 'pid': n['action'].update(target=setpoint['id'], slot='value')
        for n in self.nodes:
            if 'k-value' in n['attrs'].get('class', '').split() and n['bindings'].get('value'):
                for part in n['content']:
                    child = self.by_id.get(part.get('child')) if isinstance(part, dict) else None
                    if child and child['tag'] == 'small': child['content'] = [{'node': n['id'], 'slot': 'value', 'meta': 'unit'}]
        for n in self.nodes:
            cls = n['attrs'].get('class', '').split()
            if n['tag'] == 'path' and any(k in cls for k in ['flow-base', 'flow-active', 'pipe-base']):
                n['title'] = '回流管道' if 'flow-return' in cls else '工艺管道'
            if n['tag'] == 'g' and n['attrs'].get('transform', '').startswith('translate('):
                direct = [self.by_id[p['child']] for p in n['content'] if isinstance(p, dict) and 'child' in p]
                tank_title = next((c for c in direct if 'tank-title' in c['attrs'].get('class', '')), None)
                if tank_title:
                    n.update(title=''.join(p for p in tank_title['content'] if isinstance(p, str)), editable=True, role='tank')
            if 'panel' in cls:
                head = next((self.by_id[p['child']] for p in n['content'] if isinstance(p, dict) and 'child' in p and 'panel-head' in self.by_id[p['child']]['attrs'].get('class', '')), None)
                if head:
                    def first_text(v):
                        for part in v['content']:
                            if isinstance(part, str) and part.strip(): return part.strip()
                            if isinstance(part, dict) and 'child' in part:
                                t = first_text(self.by_id[part['child']])
                                if t: return t
                        return ''
                    n['title'] = first_text(head) or n['title']
        for n in self.nodes:
            text = ''.join(p for p in n['content'] if isinstance(p, str)).strip()
            if text == '数据质量 GOOD':
                n['content'] = [{'runtime': 'quality'}]
            if text == '系统在线':
                n['content'] = [{'runtime': 'connectionState'}]
            if self.sid == '05' and text == '正常 (50ms)':
                n['content'] = [{'runtime': 'communication'}]
            if self.sid == '05' and '操作员已鉴权' in text:
                n['content'] = [p.replace('操作员已鉴权 (OP-104)', '演示操作员 (OP-104)') if isinstance(p, str) else p for p in n['content']]
            if self.sid == '05' and 'CFR 21 Part 11' in text:
                n['content'] = [p.replace('CFR 21 Part 11 合规留痕', '本地演示操作记录') if isinstance(p, str) else p for p in n['content']]
        css = self.soup.style.get_text().replace(':root', '#screen')
        css = re.sub(r'html,body', '#screen', css)
        css += '\n#screen{position:relative;left:0;top:0;transform:none!important;transform-origin:0 0;font-size:16px;line-height:normal;font-weight:400;}\n'
        modes = []
        for m in self.modes:
            data = {**copy.deepcopy(self.data), **m['data']}
            for key in m['data']:
                if self.maps[key]['kind'] == 'number':
                    data[key] = float(data[key])
            factor = 1.12 if m['id'] == 'peak' else .96 if m['id'] == 'lowtemp' else 1
            data['loadChart.series0'] = [{**r, 'value': int(r['value'] * factor + .5)} for r in self.data['loadChart.series0']]
            add = 12 if m['id'] == 'peak' else 6 if m['id'] == 'lowtemp' else 0
            data['controlChart.series0'] = [{**r, 'value': r['value'] + add} for r in self.data['controlChart.series0']]
            modes.append({**m, 'data': data})
        return {'schemaVersion': 2, 'template': self.sid, 'title': self.soup.title.get_text(), 'skin': self.sid, 'sourceHash': hashlib.sha256(self.source.read_bytes()).hexdigest(), 'source': {'kind': 'json', 'data': json.dumps(self.data, ensure_ascii=False), 'url': '', 'pollMs': 1000, 'maxAgeMs': 5000, 'demo': True}, 'mappings': list(self.maps.values()), 'nodes': self.nodes, 'demo': {'scenarios': modes, 'initial': 'stable', 'audit': [{'time': '16:10:20', 'user': 'OP-104', 'target': 'P-01', 'action': '启动设备', 'oldVal': '停机', 'newVal': '运行', 'sbo': True, 'result': '执行成功'}, {'time': '16:05:00', 'user': 'OP-104', 'target': 'LIC-101', 'action': '更改设定值 SP', 'oldVal': '3.10 m', 'newVal': '3.20 m', 'sbo': True, 'result': '执行成功'}] if self.sid == '05' else []}, 'css': css}


def main():
    originals = {sid: next((ROOT/'scenarios/water-treatment').glob(sid+'-*.html')) for sid in ('01', '05')}
    charts = chart_options(originals['01'])
    docs = {sid: Compiler(sid, path, charts if sid == '01' else {}).compile() for sid, path in originals.items()}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('// Generated by scripts/build_studio_templates.py from reviewed originals.\nexport const nativeTemplates = ' + json.dumps(docs, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
    print(json.dumps({sid: {'nodes': len(d['nodes']), 'mappings': len(d['mappings'])} for sid, d in docs.items()}))


if __name__ == '__main__':
    main()
