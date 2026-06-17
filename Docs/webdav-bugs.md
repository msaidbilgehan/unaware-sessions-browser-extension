当前项目实现的 WebDAV 备份功能在功能完整性、安全性、代码架构以及兼容性/稳定性上存在以下主要缺陷：

  ### 一、 核心功能缺失 (Missing Core Features)

  1. 完全缺失恢复/还原 (Restore) 功能
      • 现状：代码中仅实现了备份数据的导出、加密并上传至服务器（参见 webdav-sync.ts）。用户界面 SettingsTab.svelte
      仅提供了“立即备份”按钮，没有任何获取备份列表或执行恢复的入口。
      • 对比：设计文档 web-dav.md 中规划了“备份文件管理器”及“恢复按钮”，但目前代码中未做任何 UI
      与逻辑实现，这导致当前备份功能属于“单向只写”，无法实际用于灾难恢复。
  2. 缺失设计文档中定义的部分配置项
      • 设计文档中提及的“跳过文件数据（ webdavSkipBackupFile ）”和“禁用流式上传（ webdavDisableStream
      ）”两项高级配置，在当前的类型定义 webdav-types.ts 和设置面板中并未定义或实现。

  ──────
  ### 二、 加密与恢复安全隐患 (Encryption & Security Risks)

  1. 加密密钥强绑定传输凭证
      • 现状：在备份时，加密数据的密钥是用 WebDAV 服务器的 host、username 和 password 拼接而成的（参见
      webdav-sync.ts）：
        function getWebDavPassphrase(config: WebDavConfig): string {
          return `webdav:config.host:{config.username}:${config.password}`;
        }

      • 缺陷：如果用户更改了 WebDAV 密码，或者更改了服务器地址（例如从 http 切换为


https），生成的密钥（Passphrase）会发生变化。这将导致用户无法解密并还原任何在更改配置前生成的历史备份。此外，如果在不同
设备上配置的
      URL 稍有出入（如结尾有无斜杠，或 IP 域名不一致），也会因为密钥不一致而无法恢复。
  2. 配置信息明文存储
      • WebDAV 的账号和密码以明文形式存储在  chrome.storage.local （参见
      webdav-store.ts），一旦本地计算机或浏览器扩展的隔离失效，凭证容易被恶意程序获取。

  ──────
  ### 三、 架构设计与并发缺陷 (Architectural & Concurrency Defects)

  1. Manifest V3 服务工作线程 (Service Worker) 启动时的竞态条件 (Race Condition)
      • 现状：在 service-worker.ts 中，异步的状态恢复方法 service-worker.ts
      是在顶层异步调用的，且没有阻塞后面事件监听器的注册。
      • 缺陷：当 Alarm 触发唤醒 Service Worker 时， chrome.alarms.onAlarm  可能会比 service-worker.ts 先一步执行
      webdav-sync.ts。此时由于本地存储数据尚未加载完成，扩展会使用默认的空配置（认为 WebDAV
      未启用），导致自动定时备份常常被静默跳过，触发率不稳定。
  2. 重复代码与代码漂移风险
      • 清理历史备份的逻辑（如 webdav-sync.ts）、格式化文件名等逻辑在 webdav-sync.ts 和 SettingsTab.svelte
      中被重复编写了多份（作为无法连接 background 时的 fallback）。两处代码若有一处更改，极易引入代码漂移和不一致的
      bug。

  ──────
  ### 四、 WebDAV 协议及网络传输兼容性 (WebDAV Protocol & Network Defects)

  1. 基于正则表达式的 XML 解析极其脆弱
      • 现状：webdav-client.ts 使用自定义的正则表达式来解析 PROPFIND 返回的 XML 信息（如  <href> ， <getlastmodified>
      ）。
      • 缺陷：不同 WebDAV 服务器（如坚果云、Nextcloud、群晖 WebDAV、Apache/Nginx 模块）返回的 XML
      命名空间、标签大小写、属性（如  type="dateTime"
      ）和换行格式可能有很大差异。使用硬编码正则解析极易失败或发生漏配。应使用浏览器原生的  DOMParser
      进行结构化解析。
  2. 相对路径解析失效隐患
      • 当 WebDAV 服务器返回相对路径的  <href>  时（例如不包含 host，或只返回相对子路径），当前的  hrefToPath
      难以准确解析，可能会在对比路径以过滤目录节点时出错，导致  pruneOldBackups  无法精确过滤或直接报错。
  3. 大文件传输与内存占用
      • 备份操作是将整个会话、Cookie 以及存储快照 JSON 序列化为单个字符串后执行  PUT
      请求。当数据量非常大时，会消耗大量的运行内存，且缺乏分块上传和断点续传机制，在弱网环境下极易超时或上传中断。
  4. 无离线重试或网络监听
      • 自动同步在定时器触发时直接进行网络请求，如果当前电脑处于断网状态，备份会直接失败并记录
      Error，缺少在检测到网络重新上线（如监听  navigator.onLine ）后自动重试的补偿机制。