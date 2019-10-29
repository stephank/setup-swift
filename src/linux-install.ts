import * as os from 'os'
import * as path from 'path'
import { exec } from '@actions/exec'
import * as core from '@actions/core'
import * as toolCache from '@actions/tool-cache'
import { System } from './os'
import { sign } from 'crypto'

export async function install(version: string, system: System) {
  if (os.platform() !== 'linux') {
    core.error('Trying to run linux installer on non-linux os')
    return
  }

  let swiftPath = toolCache.find(`swift-${system.name}`, version)

  if (swiftPath === null || swiftPath.trim().length == 0) {
    core.debug(`No matching installation found`)

    await setupKeys()

    let { pkg, signature, name } = await download(version, system.version)

    await verify(signature, pkg)

    swiftPath = await unpack(pkg, name, version, system)
  } else {
    core.debug('Matching installation found')
  }

  core.debug('Adding swift to path')

  let binPath = path.join(swiftPath, '/usr/bin')
  core.addPath(binPath)
  
  core.debug('Swift installed')
}

async function download(version: string, ubuntuVersion: string) {
  core.debug(`Downloading swift ${version} for ubuntu ${ubuntuVersion}`)

  let versionUpperCased = version.toUpperCase()
  let ubuntuVersionString = ubuntuVersion.replace(/\D/g, "")
  let name = `swift-${versionUpperCased}-RELEASE-ubuntu${ubuntuVersion}`
  let url = `https://swift.org/builds/swift-${version}-release/ubuntu${ubuntuVersionString}/swift-${versionUpperCased}-RELEASE/${name}.tar.gz`

  let [pkg, signature] = await Promise.all([
    toolCache.downloadTool(url),
    toolCache.downloadTool(`${url}.sig`)
  ])

  core.debug('Swift download complete')
  return { pkg, signature, name }
}

async function unpack(packagePath: string, packageName: string, version: string, system: System) {
  core.debug('Extracting package')
  let extractPath = await toolCache.extractTar(packagePath)
  core.debug('Package extracted')
  let cachedPath = await toolCache.cacheDir(path.join(extractPath, packageName), `swift-${system.name}`, version)
  core.debug('Package cached')
  return cachedPath
}

async function setupKeys() {
  core.debug('Fetching verification keys')
  let path = await toolCache.downloadTool('https://swift.org/keys/all-keys.asc')
  core.debug('Importing verification keys')
  await exec(`gpg --import "${path}"`)
  core.debug('Refreshing keys')
  await exec('gpg --keyserver hkp://pool.sks-keyservers.net --refresh-keys Swift')
}

async function verify(signaturePath: string, packagePath: string) {
  core.debug('Verifying signature')
  await exec('gpg', ['--verify', signaturePath, packagePath])
}