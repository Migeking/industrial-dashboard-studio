# 离线交付说明

## 解压与启动

1. 解压到一个新目录。直接在浏览器打开 `apps/showcase/index.html` 可查看 01–30 号离线演示。使用手机时请横屏。
2. 使用项目管理、案例库和 SCADA 设计器时，在解压目录用 Node.js 24 启动本地服务。默认入口为 `http://127.0.0.1:8099/projects`，如已设置 `STUDIO_PORT` 则使用对应端口。

   ```powershell
   node apps/scada-designer/server.mjs
   ```

3. 在「项目管理 → 导入工程」中选取此前下载的工程备份。恢复后从「查看发布」打开当前展示版，核对画面、点位和发布历史。工程备份由项目方单独提供。新工程默认使用本地演示数据，数据目录默认为解压目录下的 `works/studio`。
4. 使用 OPC UA 或 Modbus TCP 时，另装 Python 及 `apps/scada-designer/bridge-requirements.txt` 中固定版本的桥接依赖。使用现场数据时按项目配置已授权的数据地址、点位、量程、历史和告警源。值守记录方法见[只读值守验收](acceptance/hmi-monitor-trial.md)。

交付包包括项目管理与设计器、30 套离线案例及缩略图、设备和工艺单元图源、运行时和浏览器依赖。安装环境需提供 Node.js，协议桥接另需 Python。

## 从提交生成交付包

在产品仓库根目录执行以下命令。指定源提交和输出文件可保留既有 ZIP，并方便复核和追溯。

```powershell
./scripts/build-release.ps1 -Ref HEAD -OutputPath ./release/industrial-hmi-offline.zip
```

省略参数时从当前提交生成 `release/industrial-dashboard-offline.zip`。脚本输出源提交和 ZIP 的 SHA-256，ZIP 注释也记录源提交。交付范围限于指定提交中的产品应用、标准案例和相关资源。工作区草稿、站点工程备份、现场样本、凭据和本地环境配置由项目方单独保管。

## 附带工程的交付包

在「项目管理」下载工程备份。选择与该工程当前展示版发布时相同的应用提交，再显式传入备份文件。以下命令以当前 HEAD 就是发布所用提交为例。

```powershell
./scripts/build-release.ps1 -Ref HEAD -OutputPath ./release/hmi-project.zip `
  -ProjectBackup ./works/project-backup.json
```

打包工具核对工程及点表指纹、当前发布版所引用的图源和运行文件。核对通过后，包内的 `handoff/project-backup.json` 可从「导入工程」恢复，其中保留草稿、展示版和发布历史。旧备份的当前展示版若缺少发布追溯，需在选定的应用版本重新发布并下载备份。历史版本仍可按原方式单独恢复。

收到包后先核对 ZIP 的 SHA-256。解压后可在启动服务前复核配套关系，核对命令只读取本地文件。

```powershell
node apps/scada-designer/verify-handoff.mjs
```

工程备份可能包含现场地址和点位，仅随明确指定的工程包交付。现场凭据和环境配置沿用项目现场的单独配置。
