import axios from 'axios'
import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'
import { TypedEmitter } from 'tiny-typed-emitter'
import checksum from 'checksum'
import { Stream } from 'stream'

const achecksum = (path: string) => {
  return new Promise<string>(resolve => {
    checksum.file(path, (err, hash) => {
      if (err) throw new Error('Failed checksum')
      resolve(hash)
    })
  })
}

type ProgressData = {
  progress: number
  chunk: number
  total: number
}

interface ProgressDownloadEvents {
  progress: (data: ProgressData) => void
  error: <E extends Error>(error: E) => void
}

export class ProgressDownload extends TypedEmitter<ProgressDownloadEvents> {
  private progress: number = 0

  httpAgent: http.Agent
  httpsAgent: https.Agent

  constructor(
    private url: string,
    maxSockets: number = 2,
    private timeout: number = 60000
  ) {
    super()
    this.httpAgent = new http.Agent({ keepAlive: true, maxSockets })
    this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets })
  }

  async download(
    savePath: string,
    checksum?: string,
    expectedSize: number = 0
  ) {
    return new Promise<void>(async (resolve, reject) => {
      this.progress = 0
      try {
        if (
          fs.existsSync(savePath) &&
          checksum === await achecksum(savePath)
        ) {
          this.emit('progress', {
            progress: expectedSize,
            chunk: expectedSize,
            total: expectedSize
          })
          return resolve()
        }

        const { data, headers } = await axios.get<Stream>(this.url, {
          responseType: 'stream',
          timeout: this.timeout,
          httpAgent: this.httpAgent,
          httpsAgent: this.httpsAgent
        })
        const totalLength = contentLengthHeader(headers)
        const writer = fs.createWriteStream(savePath)
        data.on('data', chunk => {
          this.progress += chunk.length
          this.emit('progress', {
            progress: this.progress,
            chunk: chunk.length,
            total: totalLength
          })
          if (this.progress >= totalLength) resolve()
        })
        data.on('error', e => {
          this.emit('error', e)
          reject(e)
        })
        data.pipe(writer)
      } catch (e: any) {
        this.emit('error', e)
        reject(e)
      }
    })
  }
}

const contentLengthHeader = (headers: Record<string, any>) => {
  return +(
    headers[
    Object.keys(headers).find(v => v.includes('content-length')) ||
    'content-length'
      ] ?? 0
  )
}

export const fetchFileSize = async (url: string, timeout: number = 60000) => {
  return contentLengthHeader(
    await axios.head(url, { timeout }).then(v => v.headers)
  )
}
