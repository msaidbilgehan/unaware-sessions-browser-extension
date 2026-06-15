# WebDAV 同步核心代码

## 渲染进程同步服务

### 1. 手动备份到 WebDAV

`backupToWebdav` 函数负责手动触发备份到 WebDAV 服务器：<cite repo="CherryHQ/cherry-studio" path="src/renderer/services/BackupService.ts" start="187-352" />

```typescript
export async function backupToWebdav({
  showMessage = false,
  customFileName = '',
  autoBackupProcess = false
}: {
  showMessage?: boolean
  customFileName?: string
  autoBackupProcess?: boolean
} = {}) {
  // 检查是否已有手动备份正在进行
  if (isManualBackupRunning) {
    logger.verbose('Manual backup already in progress')
    return
  }
  
  // 自动备份过程不显示消息
  if (autoBackupProcess) {
    showMessage = false
  }

  isManualBackupRunning = true
  store.dispatch(setWebDAVSyncState({ syncing: true, lastSyncError: null }))

  // 获取 WebDAV 配置
  const {
    webdavHost,
    webdavUser,
    webdavPass,
    webdavPath,
    webdavMaxBackups,
    webdavSkipBackupFile,
    webdavDisableStream
  } = await preferenceService.getMultiple({
    webdavHost: 'data.backup.webdav.host',
    webdavUser: 'data.backup.webdav.user',
    webdavPass: 'data.backup.webdav.pass',
    webdavPath: 'data.backup.webdav.path',
    webdavMaxBackups: 'data.backup.webdav.max_backups',
    webdavSkipBackupFile: 'data.backup.webdav.skip_backup_file',
    webdavDisableStream: 'data.backup.webdav.disable_stream'
  })

  // 生成备份文件名（包含时间戳、主机名、设备类型）
  const timestamp = dayjs().format('YYYYMMDDHHmmss')
  const backupFileName = customFileName || `cherry-studio.${timestamp}.${hostname}.${deviceType}.zip`
  
  // 调用主进程执行备份
  const success = await window.api.backup.backupToWebdav({
    webdavHost,
    webdavUser,
    webdavPass,
    webdavPath,
    fileName: finalFileName,
    skipBackupFile: webdavSkipBackupFile,
    disableStream: webdavDisableStream
  })
  
  // 清理旧备份文件
  if (webdavMaxBackups > 0) {
    const files = await window.api.backup.listWebdavFiles({...})
    const currentDeviceFiles = files.filter((file) => {
      return file.fileName.includes(deviceType) && file.fileName.includes(hostname)
    })
    if (currentDeviceFiles.length > webdavMaxBackups) {
      const filesToDelete = currentDeviceFiles.slice(webdavMaxBackups)
      for (const file of filesToDelete) {
        await deleteWebdavFileWithRetry(file.fileName, {...})
      }
    }
  }
}
```

### 2. 自动同步调度器

`startAutoSync` 函数负责启动自动同步调度：<cite repo="CherryHQ/cherry-studio" path="src/renderer/services/BackupService.ts" start="590-900" />

```typescript
export async function startAutoSync(immediate = false, type?: BackupType) {
  // 根据备份类型启动特定的自动同步
  if (type === 'webdav') {
    if (webdavAutoSyncStarted) {
      return
    }

    const { webdavAutoSync, webdavHost } = await preferenceService.getMultiple({
      webdavAutoSync: 'data.backup.webdav.auto_sync',
      webdavHost: 'data.backup.webdav.host'
    })

    if (!webdavAutoSync || !webdavHost) {
      logger.info('[WebdavAutoSync] Invalid sync settings, auto sync disabled')
      return
    }

    webdavAutoSyncStarted = true
    stopAutoSync('webdav')
    void scheduleNextBackup(immediate ? 'immediate' : 'fromLastSyncTime', 'webdav')
  }

  async function scheduleNextBackup(
    scheduleType: 'immediate' | 'fromLastSyncTime' | 'fromNow',
    backupType: BackupType
  ) {
    syncInterval = await preferenceService.get('data.backup.webdav.sync_interval')
    lastSyncTime = backup.webdavSync?.lastSyncTime || undefined
    
    // 计算下次同步时间
    const requiredInterval = syncInterval * 60 * 1000
    let timeUntilNextSync = 1000

    switch (scheduleType) {
      case 'fromLastSyncTime':
        timeUntilNextSync = Math.max(1000, (lastSyncTime || 0) + requiredInterval - Date.now())
        break
      case 'fromNow':
        timeUntilNextSync = requiredInterval
        break
    }

    const timeout = setTimeout(() => performAutoBackup(backupType), timeUntilNextSync)
    webdavSyncTimeout = timeout
  }

  async function performAutoBackup(backupType: BackupType) {
    if (isRunning || isManualBackupRunning) {
      logger.verbose(`${logPrefix} Backup already in progress, rescheduling`)
      void scheduleNextBackup('fromNow', backupType)
      return
    }

    // 设置运行状态
    isWebdavAutoBackupRunning = true

    const maxRetries = 4
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        if (backupType === 'webdav') {
          await backupToWebdav({ autoBackupProcess: true })
          store.dispatch(
            setWebDAVSyncState({
              lastSyncError: null,
              lastSyncTime: Date.now(),
              syncing: false
            })
          )
        }
        
        void scheduleNextBackup('fromNow', backupType)
        break
      } catch (error: any) {
        retryCount++
        if (retryCount === maxRetries) {
          store.dispatch(setWebDAVSyncState({
            lastSyncError: 'Auto backup failed',
            lastSyncTime: Date.now(),
            syncing: false
          }))
          void scheduleNextBackup('fromNow', backupType)
        } else {
          const backoffDelay = Math.pow(2, retryCount - 1) * 10000 - 3000
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        }
      }
    }
  }
}
```

### 3. WebDAV 文件删除重试机制

`deleteWebdavFileWithRetry` 函数提供删除文件的重试逻辑：<cite repo="CherryHQ/cherry-studio" path="src/renderer/services/BackupService.ts" start="44-67" />

```typescript
async function deleteWebdavFileWithRetry(fileName: string, webdavConfig: WebDavConfig, maxRetries = 3) {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await window.api.backup.deleteWebdavFile(fileName, webdavConfig)
      logger.verbose(`Successfully deleted old backup file: ${fileName} (attempt ${attempt})`)
      return true
    } catch (error: any) {
      lastError = error
      logger.warn(`Delete attempt ${attempt}/${maxRetries} failed for ${fileName}:`, error.message)

      if (attempt < maxRetries) {
        const delay = attempt * 1000 + Math.random() * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  logger.error(`Failed to delete old backup file after ${maxRetries} attempts: ${fileName}`, lastError)
  return false
}
```

## 主进程备份实现

### 4. 备份到 WebDAV

`backupToWebdav` 方法在主进程中执行实际的备份操作：<cite repo="CherryHQ/cherry-studio" path="src/main/services/LegacyBackupManager.ts" start="471-493" />

```typescript
async backupToWebdav(_: Electron.IpcMainInvokeEvent, webdavConfig: WebDavConfig) {
  const filename = webdavConfig.fileName || 'cherry-studio.backup.zip'
  const backupedFilePath = await this.backup(_, filename, undefined, webdavConfig.skipBackupFile)
  const webdavClient = this.getWebDavInstance(webdavConfig)
  try {
    let result
    if (webdavConfig.disableStream) {
      // 内存上传方式
      const fileContent = await fs.readFile(backupedFilePath)
      result = await webdavClient.putFileContents(filename, fileContent, { overwrite: true })
    } else {
      // 流式上传方式
      const contentLength = (await fs.stat(backupedFilePath)).size
      result = await webdavClient.putFileContents(filename, fs.createReadStream(backupedFilePath), {
        overwrite: true,
        contentLength
      })
    }
    await fs.remove(backupedFilePath)
    return result
  } catch (error) {
    await fs.remove(backupedFilePath).catch(() => {})
    throw error
  }
}
```

### 5. WebDAV 客户端实例管理

`getWebDavInstance` 方法缓存 WebDAV 客户端实例：<cite repo="CherryHQ/cherry-studio" path="src/main/services/LegacyBackupManager.ts" start="959-978" />

```typescript
private getWebDavInstance(webdavConfig: WebDavConfig): WebDav {
  const currentConfig = {
    webdavHost: webdavConfig.webdavHost,
    webdavUser: webdavConfig.webdavUser,
    webdavPass: webdavConfig.webdavPass,
    webdavPath: webdavConfig.webdavPath
  }

  // 检查配置是否变更
  if (
    this.cachedWebdavConnectionConfig &&
    JSON.stringify(this.cachedWebdavConnectionConfig) === JSON.stringify(currentConfig)
  ) {
    return this.webdavInstance!
  }

  // 配置变更，创建新实例
  this.cachedWebdavConnectionConfig = currentConfig
  this.webdavInstance = new WebDav(
    webdavConfig.webdavHost,
    webdavConfig.webdavUser,
    webdavConfig.webdavPass,
    webdavConfig.webdavPath
  )
  return this.webdavInstance
}
```

## UI 层同步控制

### 6. 同步间隔变更处理

`onSyncIntervalChange` 函数处理同步间隔配置变更：<cite repo="CherryHQ/cherry-studio" path="src/renderer/pages/settings/DataSettings/WebDavSettings.tsx" start="38-47" />

```typescript
const onSyncIntervalChange = async (value: number) => {
  void setWebdavSyncInterval(value)
  if (value === 0) {
    await setWebdavAutoSync(false)
    stopAutoSync('webdav')
  } else {
    await setWebdavAutoSync(true)
    void startAutoSync(false, 'webdav')
  }
}
```

## Notes

同步核心代码主要分为三个层次：渲染进程的 `BackupService.ts` 负责同步调度和状态管理，主进程的 `LegacyBackupManager.ts` 负责实际的文件操作和 WebDAV 通信，UI 层的 `WebDavSettings.tsx` 负责用户配置和触发同步。自动同步采用定时器+重试机制，确保在网络不稳定时能够恢复同步。<cite repo="CherryHQ/cherry-studio" path="src/renderer/services/BackupService.ts" start="590-900" />

