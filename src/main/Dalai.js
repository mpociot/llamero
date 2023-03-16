import os from 'os';
import pty from 'node-pty';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import path from 'path';
import fs from 'fs';
import tar from 'tar';
import Downloader from 'nodejs-file-downloader';
import semver from 'semver';
import * as _7z from '7zip-min';
import { platform } from 'os';
import { BrowserWindow } from 'electron';
import log from 'electron-log'
import fixPath from 'fix-path'
fixPath()

const shell = process.env[platform() === 'win32' ? 'COMSPEC' : 'SHELL']

class Dalai {
  constructor(home) {
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // 1. manually set llama.cpp home
    // 2. otherwise store llama.cpp at ~/llama.cpp
    //
    //  # NOTE
    //  Could have used process.cwd() (The current execution directory) to download llama.cpp
    //  but this makes it cumbersome as you try to build multiple apps, because by default Dalai client will
    //  look for the current execution directory for llama.cpp.
    //  It's simpler to set the ~/llama.cpp as the default directory and use that path as the single source
    //  of truth and let multiple apps all connect to that path
    //  Otherwise if you want to customize the path you can just pass in the "home" attribute to manually set it.
    //
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////
    this.home = home ? path.resolve(home) : path.resolve(os.homedir(), 'llama.cpp')

    try {
      fs.mkdirSync(this.home, { recursive: true })
    } catch (e) {}

    this.config = {
      name: 'xterm-color',
      encoding: null,
      cols: 200,
      rows: 30,
      env: process.env,
    }

    this.stopped = false
  }

  async download(model) {
    if (!this.shouldContinue()) {
      return
    }

    console.log(`Download model ${model}`)

    const num = {
      '7B': 1,
      '13B': 2,
      '30B': 4,
      '65B': 8
    }

    const files = ['checklist.chk', 'params.json']

    for (let i = 0; i < num[model]; i++) {
      files.push(`consolidated.0${i}.pth`)
    }

    console.log('home', this.home)
    console.log('resolved path', model)

    const resolvedPath = path.resolve(this.home, 'models', model)
    await fs.promises.mkdir(resolvedPath, { recursive: true }).catch((e) => {})

    for (let file of files) {
      if (fs.existsSync(path.resolve(resolvedPath, file))) {
        console.log(`Skip file download, it already exists: ${file}`)
        continue
      }
      if (!this.shouldContinue()) {
        return
      }

      const task = `downloading ${file}`

      const downloader = new Downloader({
        url: `https://agi.gpt4.org/llama/LLaMA/${model}/${file}`,
        directory: path.resolve(this.home, 'models', model),
        onProgress: (percentage, chunk, remainingSize) => {
          this.progress(task, percentage)
        }
      })

      this.downloader = downloader

      try {
        await this.startProgress(task)
        await this.downloader.download()

        this.downloader = null
      } catch (error) {
        console.log(error)
        this.writeOutput(error, 'error')
      }

      this.progress('download', 0)
    }

    const files2 = ['tokenizer_checklist.chk', 'tokenizer.model']
    for (let file of files2) {
      if (!this.shouldContinue()) {
        return
      }

      if (fs.existsSync(path.resolve(this.home, 'models', file))) {
        console.log(`Skip file download, it already exists: ${file}`)
        continue
      }
      const task = `downloading ${file}`
      const downloader = new Downloader({
        url: `https://agi.gpt4.org/llama/LLaMA/${file}`,
        directory: path.resolve(this.home, 'models'),
        onProgress: (percentage, chunk, remainingSize) => {
          this.progress(task, percentage)
        }
      })

      this.downloader = downloader

      try {
        await this.startProgress(task)
        await downloader.download()
      } catch (error) {
        console.log(error)
      }
      this.downloader = null
      this.progress('download', 0)
    }
  }

  async installed() {
    const modelsPath = path.resolve(this.home, 'models')
    console.log('modelsPath', modelsPath)
    const modelFolders = (await fs.promises.readdir(modelsPath, { withFileTypes: true }))
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)

    console.log({ modelFolders })
    const modelNames = []
    for (let modelFolder of modelFolders) {
      if (fs.existsSync(path.resolve(modelsPath, modelFolder, 'ggml-model-q4_0.bin'))) {
        modelNames.push(modelFolder)
        console.log('exists', modelFolder)
      }
    }
    return modelNames
  }

  async python() {
    if (!this.shouldContinue()) {
      return
    }

    // install self-contained python => only for windows for now
    // 1. download
    // 2. unzip

    const filename = 'cpython-3.10.9+20230116-x86_64-pc-windows-msvc-shared-install_only.tar.gz'
    const task = 'ddownloading self contained python'
    const downloader = new Downloader({
      url: `https://github.com/indygreg/python-build-standalone/releases/download/20230116/${filename}`,
      directory: this.home,
      onProgress: (percentage, chunk, remainingSize) => {
        this.progress(task, percentage)
      }
    })
    this.downloader = downloader

    try {
      await this.startProgress(task)
      await downloader.download()
    } catch (error) {
      console.log(error)
    }
    this.downloader = null

    await this.startProgress('Extracting python')
    this.progress('extracting python', 0)
    console.log('extracting python')
    await tar.x({
      file: path.resolve(this.home, filename),
      C: this.home,
      strict: true
    })
    console.log('cleaning up temp files')

    await fs.promises.rm(path.resolve(this.home, filename))
  }
  async mingw() {
    const mingw =
      'https://github.com/niXman/mingw-builds-binaries/releases/download/12.2.0-rt_v10-rev2/x86_64-12.2.0-release-win32-seh-msvcrt-rt_v10-rev2.7z'
    const downloader = new Downloader({
      url: mingw,
      directory: this.home,
      onProgress: (percentage, chunk, remainingSize) => {
        this.progress('download mingw', percentage)
      }
    })
    try {
      await this.startProgress('download mingw')
      await downloader.download()
    } catch (error) {
      console.log(error)
    }
    this.progress('download mingw', 0)
    await new Promise((resolve, reject) => {
      _7z.unpack(
        path.resolve(this.home, 'x86_64-12.2.0-release-win32-seh-msvcrt-rt_v10-rev2.7z'),
        this.home,
        (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        }
      )
    })
    console.log('cleaning up temp files')
    await fs.promises.rm(
      path.resolve(this.home, 'x86_64-12.2.0-release-win32-seh-msvcrt-rt_v10-rev2.7z')
    )
  }

  async installPreRequsites() {
    if (!this.shouldContinue()) {
      return false
    }

    await this.startProgress('Installing pre-requisites')

    let success = false

    const root_pip_paths =
      platform === 'win32' ? [path.resolve(this.home, 'python', 'python -m pip')] : ['pip3', 'pip']

    if (platform === 'linux') {
      // ubuntu debian
      success = await this.exec('apt-get install build-essential python3-venv -y')
      if (!success) {
        // fefdora
        await this.exec('dnf install make automake gcc gcc-c++ kernel-devel python3-virtualenv -y')
      }
    } else {
      // for win32 / darwin
      for (let root_pip_path of root_pip_paths) {
        await this.exec(`${root_pip_path} install --user virtualenv`)
      }
    }

    return success
  }

  async install(...models) {
    this.stopped = false

    let success

    try {
      console.log('try cloning')
      await this.startProgress('Cloning repository')
      await git.clone({
        fs,
        http,
        dir: this.home,
        url: 'https://github.com/ggerganov/llama.cpp.git',
        onProgress: (progress) => {
          this.progress('Cloning repository', progress.total)
        },
        onMessage: (message) => {
          this.writeOutput(message)
        }
      })
    } catch (e) {
      await this.startProgress('Pulling repository changes')
      await git.pull({
        fs,
        http,
        dir: this.home,
        url: 'https://github.com/ggerganov/llama.cpp.git',
        onProgress: (progress) => {
          this.progress('Cloning repository', progress.total)
        },
        onMessage: (message) => {
          this.writeOutput(message)
        }
      })
    }

    // windows don't ship with python, so install a dedicated self-contained python
    if (platform === 'win32') {
      await this.python()
    }

    const root_python_paths =
      platform === 'win32'
        ? [path.resolve(this.home, 'python', 'python.exe')]
        : ['python3', 'python']

    // prerequisites
    success = await this.installPreRequsites()

    // create venv
    const venv_path = path.join(this.home, 'venv')

    await this.startProgress('Creating virtual environment')
    for (let root_python_path of root_python_paths) {
      success = await this.exec(`${root_python_path} -m venv ${venv_path}`)
    }

    // different venv paths for Windows
    const pip_path =
      platform === 'win32'
        ? path.join(venv_path, 'Scripts', 'pip.exe')
        : path.join(venv_path, 'bin', 'pip')
    const python_path =
      platform == 'win32'
        ? path.join(venv_path, 'Scripts', 'python.exe')
        : path.join(venv_path, 'bin', 'python')

    // upgrade setuptools
    this.startProgress('Upgrading setuptools')

    success = await this.exec(`${pip_path} install --upgrade pip setuptools wheel`)
    if (!success) {
      throw new Error('pip setuptools wheel upgrade failed')
      return
    }

    // install to ~/llama.cpp
    this.startProgress('Installing Python dependencies')
    success = await this.exec(
      `${pip_path} install torch torchvision torchaudio sentencepiece numpy`
    )
    if (!success) {
      throw new Error('dependency installation failed')
      return
    }

    if (platform === 'win32') {
      this.startProgress('Installing cmake')
      success = await this.exec(`${pip_path} install cmake`)
      if (!success) {
        throw new Error('cmake installation failed')
        return
      }
      await this.exec('mkdir build', this.home)
      await this.exec(
        `Remove-Item -path ${path.resolve(this.home, 'build', 'CMakeCache.txt')}`,
        this.home
      )

      this.startProgress('Building')
      const cmake_path = path.join(venv_path, 'Scripts', 'cmake')
      await this.exec(`${cmake_path} ..`, path.resolve(this.home, 'build'))
      await this.exec(`${cmake_path} --build . --config Release`, path.resolve(this.home, 'build'))
    } else {
      this.startProgress('Building')
      success = await this.exec('make', this.home)
      if (!success) {
        throw new Error("running 'make' failed")
        return
      }
    }

    for (let model of models) {
      await this.download(model)

      const outputFile = path.resolve(this.home, 'models', model, 'ggml-model-f16.bin')

      if (fs.existsSync(outputFile)) {
        console.log(`Skip conversion, file already exists: ${outputFile}`)
      } else {
        await this.startProgress(`Converting ${model} to ggml`)
        await this.exec(`${python_path} convert-pth-to-ggml.py models/${model}/ 1`, this.home)
      }

      await this.quantize(model)
    }

    this.finished()
  }

  async request(req, cb) {
    if (req.url) {
      await this.connect(req, cb)
    } else {
      await this.query(req, cb)
    }
  }

  async query(req, cb) {
    console.log(`> query:`, req)

    let o = {
      seed: req.seed || -1,
      threads: req.threads || 8,
      n_predict: req.n_predict || 128,
      model: `models/${req.model || '7B'}/ggml-model-q4_0.bin`
    }

    if (!fs.existsSync(path.resolve(this.home, o.model))) {
      this.queryFinished()
      return
    }

    if (req.top_k) o.top_k = req.top_k
    if (req.top_p) o.top_p = req.top_p
    if (req.temp) o.temp = req.temp
    if (req.batch_size) o.batch_size = req.batch_size
    if (req.repeat_last_n) o.repeat_last_n = req.repeat_last_n
    if (req.repeat_penalty) o.repeat_penalty = req.repeat_penalty

    let chunks = []
    for (let key in o) {
      chunks.push(`--${key} ${o[key]}`)
    }
    chunks.push(`-p "${req.prompt}"`)

    const main_bin_path =
      platform === 'win32'
        ? path.resolve(this.home, 'build', 'Release', 'llama')
        : path.resolve(this.home, 'main')
    if (req.full) {
      await this.exec(`${main_bin_path} ${chunks.join(' ')}`, this.home, cb)
      this.queryFinished()
    } else {
      const startpattern = /.*sampling parameters:.*/g
      const endpattern = /.*mem per token.*/g
      let started = false
      let ended = false
      let writeEnd = !req.skip_end
      await this.exec(`${main_bin_path} ${chunks.join(' ')}`, this.home, (msg) => {
        if (endpattern.test(msg)) ended = true
        if (started && !ended) {
          cb(msg.toString())
        } else if (ended && writeEnd) {
          this.queryFinished()

          writeEnd = false
        }
        if (startpattern.test(msg)) started = true
      })
    }
  }

  exec(cmd, cwd, cb) {
    return new Promise((resolve, reject) => {
      if (!this.shouldContinue()) {
        resolve(false)
        return
      }

      const config = Object.assign({}, this.config)
      if (cwd) {
        config.cwd = path.resolve(cwd)
      } else {
        config.cwd = path.resolve(this.home)
      }
      log.info(`exec: ${cmd} in ${config.cwd}`)

      try {
        let ptyProcess = pty.spawn(shell, [], config)
        this.ptyProcess = ptyProcess

        ptyProcess.onData((data) => {
          if (cb) {
            cb(data)
          } else {
            this.writeOutput(data)
          }
        })

        ptyProcess.onExit((res) => {
          log.info(`process exited: ${res.exitCode}`)
          this.ptyProcess = null

          if (res.exitCode === 0) {
            // successful
            resolve(true)
          } else {
            // something went wrong
            resolve(false)
          }
        })

        ptyProcess.write(`${cmd}\r`)
        ptyProcess.write('exit\r')
      } catch (e) {
        log.error(e)
      }
    })
  }

  async quantize(model) {
    if (!this.shouldContinue()) {
      return
    }

    let num = {
      '7B': 1,
      '13B': 2,
      '30B': 4,
      '65B': 8
    }
    
    await this.startProgress(`Quantizing ${model}`)

    for (let i = 0; i < num[model]; i++) {
      const suffix = i === 0 ? '' : `.${i}`
      const outputFile1 = path.resolve(this.home, `./models/${model}/ggml-model-f16.bin${suffix}`)
      const outputFile2 = path.resolve(this.home, `./models/${model}/ggml-model-q4_0.bin${suffix}`)
      if (fs.existsSync(outputFile1) && fs.existsSync(outputFile2)) {
        console.log(`Skip quantization, files already exists: ${outputFile1} and ${outputFile2}}`)
        continue
      }
      const bin_path =
        platform === 'win32' ? path.resolve(this.home, 'build', 'Release') : this.home
      await this.exec(`./quantize ${outputFile1} ${outputFile2} 2`, bin_path)
    }
  }

  writeOutput(msg, type = 'info') {
    BrowserWindow.getAllWindows().map((win) => win.webContents.send('output', { msg: msg, type }))
  }

  finished() {
    BrowserWindow.getAllWindows().map((win) => win.webContents.send('finished'))
  }

  queryFinished() {
    BrowserWindow.getAllWindows().map((win) => win.webContents.send('queryFinished'))
  }

  progress(task, percent) {
    BrowserWindow.getAllWindows().map((win) => win.webContents.send('progress', { task, percent }))
    console.log('progress', task, percent)
  }

  startProgress(task) {
    if (!this.shouldContinue()) {
      return
    }

    BrowserWindow.getAllWindows().map((win) => win.webContents.send('startProgress', { task }))
    console.log('start progress', task)
  }

  stop() {
    if (this.ptyProcess) {
      this.ptyProcess.kill()
    }

    if (this.downloader) {
      this.downloader.cancel()
    }

    this.stopped = true
  }

  shouldContinue() {
    return !this.stopped
  }
}

export default Dalai