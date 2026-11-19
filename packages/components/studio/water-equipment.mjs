// Reusable equipment contracts. Artwork contains no operational state or point IDs.
const waterSlot = (key, label, kind = 'number', role = 'extra', required = false) => ({
  key, label, kinds: [kind], role, required,
});
const waterRunSlots = () => [
  waterSlot('run', '运行反馈', 'boolean', 'run', true),
  waterSlot('fault', '故障反馈', 'boolean', 'fault'),
  waterSlot('value', '运行频率', 'number', 'value'),
];
const waterProcessSlots = (label, extras = []) => [
  waterSlot('value', label, 'number', 'value', true),
  waterSlot('run', '运行反馈', 'boolean', 'run'),
  waterSlot('fault', '故障反馈', 'boolean', 'fault'),
  ...extras.map(([key, name]) => waterSlot(key, name)),
];
const waterPorts = (labels = ['进口', '出口', '辅助进口', '排放口'], geometry = {}) => [
  {id:'left', label:labels[0], x:0, y:35, direction:'in', anchor:[14,35]},
  {id:'right', label:labels[1], x:100, y:35, direction:'out', anchor:[86,35]},
  {id:'top', label:labels[2], x:35, y:0, direction:'in', anchor:[35,12]},
  {id:'bottom', label:labels[3], x:75, y:68, direction:'out', anchor:[75,58]},
].map(p=>({...p,...geometry[p.id]}));
const waterDevice = (label, prefix, keywords, slots, ports, description) => ({
  label, prefix, category:'devices', keywords, description,
  w:240, h:330, pictureHeight:220, slots, ports:ports.map(p=>p.id), portDefinitions:ports,
});
const waterUnit = (label, prefix, keywords, slots, ports, description) => ({
  label, prefix, category:'units', keywords, description,
  w:600, h:440, pictureHeight:300, slots, ports:ports.map(p=>p.id), portDefinitions:ports,
});
export const waterEquipment = {
  gravityThickener:waterDevice('重力浓缩池','TK','污泥 浓缩 浓缩池 thickener',waterProcessSlots('液位',[['solids','出泥含固率']]),waterPorts(['进泥口','出泥口','上清液口','排空口'],{left:{anchor:[15,30]},right:{anchor:[85,44]},top:{direction:'out',anchor:[15,28],routingSide:'left'}}),'重力浓缩与刮泥单元；上清液、浓缩污泥分别接管。'),
  screwPump:{...waterDevice('螺杆进泥泵','P','进泥 螺杆 pump',waterRunSlots(),waterPorts(['吸入口','排出口','冲洗口','排空口'],{left:{anchor:[3,42]},right:{anchor:[56,22],routingSide:'top'}}),'容积式螺杆泵；运行、故障及频率独立绑定。'),w:300,h:210,pictureHeight:140},
  decanterCentrifuge:{...waterDevice('离心脱水机','DC','污泥 离心 脱水 centrifuge',waterRunSlots().map(s=>s.key==='value'?{...s,label:'转速'}:s).concat([waterSlot('torque','扭矩'),waterSlot('moisture','泥饼含水率')]),waterPorts(['进泥口','泥饼出口','药液接口','分离液出口'],{left:{anchor:[6,23]},right:{anchor:[92,29]},bottom:{anchor:[35,38]}}),'卧螺离心脱水设备；与叠螺机分别定义。'),w:320,h:240,pictureHeight:115},
  polymerPreparation:waterUnit('PAM 三槽制备装置','PAM','三槽 加药 熟化 PAM polymer',waterProcessSlots('投加配比',[['level','储液液位']]),waterPorts(['配水进口','药液出口','干粉入口','放空口']),'溶解、熟化、储液三槽制备与投加单元。'),
  cakeSilo:{...waterDevice('泥饼输送与料仓','BN','泥饼 料仓 螺旋 外运 silo',waterProcessSlots('料仓料位'),waterPorts(['泥饼进口','出料口','检修口','放空口'],{left:{anchor:[8,30]},right:{anchor:[60,58]}}),'螺旋输送与泥饼暂存单元，料位独立绑定。'),w:240,h:330,pictureHeight:220},
  staticMixer:{...waterDevice('管道静态混合器','SMX','调理 静态 混合 mixer',[waterSlot('value','过泥流量','number','value')],waterPorts(['进泥口','调理泥出口','药液进口','排空口'],{left:{anchor:[5,18]},right:{anchor:[95,18]},top:{anchor:[50,5]}}),'无电机的管道混合器，独立药液接口。'),w:200,h:180,pictureHeight:70},
  motor:waterDevice('电动机','EM','电机 驱动 motor',waterRunSlots(),[],'独立电动机，无工艺流体接口；风机和泵使用各自独立组件。'),
  submersibleMixer:waterDevice('潜水推流器','SM','潜水 搅拌 推流 mixer',waterRunSlots(),[],'潜水推流搅拌设备；运行、故障及频率分别绑定。'),
  gritSeparator:waterDevice('砂水分离器','GSW','沉砂 螺旋 砂水 分离 grit',waterRunSlots(),waterPorts(['砂水进口','排砂出口','冲洗进口','分离水出口'],{left:{anchor:[8,28]},right:{anchor:[92,25]}}),'螺旋砂水分离设备；接口为工艺示意，可在元素定义调整。'),
  dissolvedAirFlotation:waterUnit('溶气气浮装置','DAF','气浮 溶气 絮凝 除油 flotation',waterProcessSlots('出水浊度',[['pressure','溶气压力'],['recycleFlow','回流流量']]),waterPorts(['进水口','清水出口','加药口','浮渣出口'],{left:{anchor:[20,33]},right:{anchor:[97,30]}}),'溶气、浮选和表面刮渣单元，反馈均使用已配置测点。'),
  liftStation:waterUnit('一体化提升泵站','LS','提升 污水 泵站 wet well',waterProcessSlots('集水井液位',[['flow','出水流量'],['pressure','出口压力']]),waterPorts(['污水进口','压力出水','检修接口','放空口'],{left:{anchor:[29,41]},right:{anchor:[70,15]},top:{anchor:[50,5]},bottom:{anchor:[50,65]}}),'双泵提升单元；整机状态使用独立整机点，内部结构为静态示意。'),
  submersiblePump: waterDevice('潜污泵','SP','潜水 排污 提升 泵房 pump',waterRunSlots(),[
    {id:'bottom',label:'吸入口',x:44,y:68,direction:'in',anchor:[44,61]},
    {id:'right',label:'排出口',x:100,y:52,direction:'out',anchor:[83,52]},
  ],'潜水排污泵；运行、故障和频率独立绑定。'),
  verticalMixer: waterDevice('立式搅拌机','MX','混合 絮凝 搅拌 桨 mixer',waterRunSlots(),[],
    '立式减速电机、搅拌轴与桨叶；作为机械设备放入池体附近，无工艺管接口。'),
  chemicalTank: waterDevice('立式药箱','CT','储罐 药罐 酸碱 PAC PAM tank',[
    waterSlot('value','液位','number','value',true), waterSlot('fault','液位报警','boolean','fault'),
  ],[
    {id:'top',label:'补药口',x:40,y:0,direction:'in',anchor:[40,14]},
    {id:'right',label:'供药口',x:100,y:58,direction:'out',anchor:[78,58]},
  ],'立式储药罐；液位为工程量，报警使用已有布尔点。'),
  pressureFilter: waterDevice('压力过滤器','PF','砂滤 多介质 活性炭 净水 filter',waterProcessSlots('出口压力',[
    ['differentialPressure','过滤压差'], ['flow','出水流量'],
  ]),waterPorts(['原水进口','滤后水出口','反洗进口','排污口']),
    '压力式多介质过滤器；出口压力、压差和流量分别绑定。'),
  screenRake: waterDevice('机械格栅','GS','粗格栅 细格栅 预处理 除污 screen',waterRunSlots(),
    [
      {id:'left',label:'进水口',x:0,y:50,direction:'in',anchor:[10,50]},
      {id:'right',label:'出水口',x:100,y:33,direction:'out',anchor:[93,33]},
      {id:'top',label:'排渣口',x:95,y:5,direction:'out',anchor:[80,13]},
    ],
    '含短渠段的机械格栅；进出水与排渣接口独立。'),
  screwPress: waterDevice('叠螺脱水机','DP','污泥 脱水 压滤 螺旋 screw press',[
    ...waterRunSlots(),waterSlot('feedFlow','进泥流量'),waterSlot('dryness','泥饼含固率'),
  ],waterPorts(['进泥口','泥饼出口','冲洗口','滤液出口']),
    '叠螺污泥脱水设备；频率、进泥流量和含固率独立显示。'),
  lamellaClarifier: waterUnit('高效沉淀池','HC','高密度 斜管 混合 絮凝 澄清 Densadeg Actiflo',
    [...waterProcessSlots('出水浊度',[
      ['sludgeLevel','泥位'],['recycleFlow','回流流量'],['pacRate','PAC 投加量'],['pamRate','PAM 投加量'],
    ]),waterSlot('rapidRun','快速搅拌运行','boolean'),waterSlot('rapidFault','快速搅拌故障','boolean'),waterSlot('rapidHz','快速搅拌频率'),
    waterSlot('flocRun','絮凝搅拌运行','boolean'),waterSlot('flocFault','絮凝搅拌故障','boolean'),waterSlot('flocHz','絮凝搅拌频率')],waterPorts(['原水进口','清水出口','加药接口','回流 / 排泥口'],{
      left:{y:31,anchor:[5,31]},right:{y:31,anchor:[95,31]},top:{x:56,anchor:[56,19]},bottom:{y:70,anchor:[75,59]},
    }),
    '混合、絮凝与斜管沉淀一体单元；两台搅拌机反馈独立，整机运行 / 故障使用已有整机点，不自动合并。'),
  circularClarifier: waterUnit('二沉池','SC','辐流 沉淀 刮吸泥 澄清 clarifier',
    waterProcessSlots('泥位', [['turbidity','出水浊度'],['recycleFlow','回流流量']]),
    waterPorts(['混合液进口','澄清水出口','辅助进口','回流 / 剩余污泥口'],{
      left:{y:31,anchor:[5,31]},right:{y:31,anchor:[95,31]},bottom:{x:50,y:70,anchor:[50,60]},
    }),
    '辐流式二沉池；含中心进水、溢流堰和刮泥结构的静态剖视。'),
  aerationTank: waterUnit('生物曝气池','AT','生化 活性污泥 A2O 好氧 DO aeration',
    waterProcessSlots('溶解氧', [['level','液位'],['airFlow','曝气流量']]),
    waterPorts(['进水口','混合液出口','空气进口','放空口']),
    '带曝气盘和空气管路的生物处理池；溶解氧、液位、风量分别绑定。'),
  mbrModule: waterUnit('MBR 膜池','MBR','膜生物反应 膜组器 膜箱 超滤 membrane',
    waterProcessSlots('跨膜压差', [['permeateFlow','产水流量'],['level','液位']]),
    waterPorts(['混合液进口','产水出口','曝气进口','排泥口']),
    '浸没式膜池、膜架与底部曝气管；压差、产水和液位为独立测点。'),
  dosingSkid: waterUnit('成套加药装置','DS','PAC PAM 次氯酸钠 计量 消毒 投加 dosing',
    [...waterProcessSlots('药箱 A 液位', [['tankBLevel','药箱 B 液位'],['doseFlowA','A 路投加流量'],['doseFlowB','B 路投加流量'],['frequencyA','A 泵频率'],['frequencyB','B 泵频率']]),
      waterSlot('pumpARun','A 泵运行','boolean'),waterSlot('pumpAFault','A 泵故障','boolean'),
      waterSlot('pumpBRun','B 泵运行','boolean'),waterSlot('pumpBFault','B 泵故障','boolean')],
    waterPorts(['补药口','投加出口','稀释水进口','排空口'],{right:{y:47,anchor:[84,47]}}),
    '双药箱、计量泵与控制柜；A / B 路液位、流量、频率及反馈分别绑定，整机状态使用已有整机点。'),
  filterTrain: waterUnit('重力滤池','GF','砂滤 滤料 反冲洗 V型 快滤 净水 filtration',
    waterProcessSlots('滤后浊度', [['level','液位'],['headLoss','水头损失']]),
    waterPorts(['原水进口','滤后水出口','反洗排水口','反洗进口'],{
      left:{y:19,anchor:[4,19]},right:{y:30,anchor:[96,30]},top:{direction:'out'},bottom:{x:51,y:70,anchor:[51,63],direction:'in'},
    }),
    '单格重力滤池，显示滤料分层与配水系统；可复制组建多格滤池。'),
  roSkid: waterUnit('RO 反渗透装置','RO','净水 纯水 膜分离 高压 reverse osmosis',
    waterProcessSlots('产水电导率', [['permeateFlow','产水流量'],['pressure','进膜压力']]),
    waterPorts(['原水进口','产水出口','清洗进口','浓水出口'],{left:{y:52,anchor:[5,52]},right:{y:42,anchor:[94,42]}}),
    '高压泵、膜壳与管路组成的 RO 单元；产水与浓水接口分开。'),
  uvChannel: waterUnit('紫外消毒渠','UV','紫外 灯管 消毒 出水 uv disinfection',
    waterProcessSlots('紫外剂量', [['intensity','紫外强度'],['flow','过水流量']]),
    waterPorts(['进水口','出水口','清洗接口','放空口']),
    '开放渠式紫外灯组；剂量、强度与流量仅显示已有测点，不计算消毒效果。'),
};

export const waterEquipmentGroups = {
  devices: Object.keys(waterEquipment).filter(key=>waterEquipment[key].category==='devices'),
  units: Object.keys(waterEquipment).filter(key=>waterEquipment[key].category==='units'),
};
