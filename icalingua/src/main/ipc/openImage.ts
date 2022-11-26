import { execFileSync, execFile } from 'child_process'
import which from 'which'
import { BrowserWindow, ipcMain, clipboard, nativeImage } from 'electron'
import path from 'path'
import querystring from 'querystring'
import getStaticPath from '../../utils/getStaticPath'
import ui from '../utils/ui'
import md5 from 'md5'
import { newIcalinguaWindow } from '../../utils/IcalinguaWindow'
import { getMainWindowScreen } from '../utils/windowManager'
import { toInteger } from 'lodash'
import axios from 'axios'

let viewer = ''
const VIEWERS = ['gwenview', 'eog', 'eom', 'ristretto', 'okular', 'gimp']

try {
    const xdgDefault = execFileSync('xdg-mime', ['query', 'default', 'image/jpeg']).toString()
    for (const i of VIEWERS) {
        if (xdgDefault.includes(i)) {
            viewer = i
            break
        }
    }
} catch (e) {}

if (!viewer) {
    for (const i of VIEWERS) {
        const resolved = which.sync(i, { nothrow: true })
        if (resolved) {
            viewer = i
            break
        }
    }
}

if (!viewer) {
    console.log('Cannot find an external image viewer')
}

const builtinViewers = new Map<string, BrowserWindow>()
const openImage = (url: string, external: boolean = false, urlList: Array<string> = []) => {
    if (!external) {
        const urlMd5 = md5(url)
        if (builtinViewers.get(urlMd5)) {
            const viewerWindow = builtinViewers.get(urlMd5)
            viewerWindow.focus()
        } else {
            const viewerWindow = newIcalinguaWindow({
                autoHideMenuBar: true,
                webPreferences: {
                    contextIsolation: false,
                    preload: path.join(getStaticPath(), 'openImagePreload.js'),
                },
            })
            // get main window screen location
            const bound = viewerWindow.getBounds()
            const screen = getMainWindowScreen()
            if (screen) {
                const alignX = toInteger(screen.workArea.x + screen.workArea.width / 2 - bound.width / 2)
                const alignY = toInteger(screen.workArea.y + screen.workArea.height / 2 - bound.height / 2)
                viewerWindow.setBounds({
                    x: alignX,
                    y: alignY,
                })
            }
            viewerWindow.loadURL(
                'file://' + path.join(getStaticPath(), 'imgView.html') + '?' + querystring.stringify({ url }),
            )
            //viewerWindow.maximize()
            if (urlList.length > 0) {
                // TODO: multiple images
            } else {
                viewerWindow.on('closed', () => builtinViewers.delete(urlMd5))
                builtinViewers.set(urlMd5, viewerWindow)
            }
        }
    } else if (viewer) {
        execFile(viewer, [url])
    } else {
        ui.messageError('找不到可用的本地查看器')
    }
}

const copyImage = async (url: string) => {
    // console.log(clipboard.availableFormats(),clipboard.read('text/uri-list'))
    if (url.startsWith('data:')) {
        // base64 图片
        clipboard.writeImage(nativeImage.createFromDataURL(url))
        return
    }
    // 如果url是本地地址，则直接读取
    if (!url.startsWith('http')) {
        const image = nativeImage.createFromPath(url)
        if (!image.isEmpty()) {
            clipboard.writeImage(image)
        } else {
            clipboard.writeHTML(`<img src="${url}" >`)
            //clipboard.write({text: url, type: 'text/uri-list'})
        }
        return
    }
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        proxy: false,
    })
    const buf = Buffer.from(res.data, 'binary')
    const image = nativeImage.createFromBuffer(buf)
    if (!image.isEmpty()) {
        clipboard.writeImage(image)
    } else {
        clipboard.writeHTML(`<img src="${url}" >`)
    }
}

ipcMain.on('openImage', (e, url: string, external: boolean = false, urlList: Array<string> = []) =>
    openImage(url, external, urlList)
)
ipcMain.on('copyImage', (e, url: string) => copyImage(url))

export { openImage, copyImage }
