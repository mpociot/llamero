<template>
  <div class="w-full h-screen flex flex-col p-8">
    <Playground 
      v-if="installedModels.length > 0 && !installingModel"
      :installedModels="installedModels" 
      @installModel="installModel"
    />

    <div v-if="installedModels.length === 0 || installingModel"
      class="flex flex-col space-y-4 overflow-x-hidden"
    >
      <template v-if="task">
        <div class="flex justify-between my-8">
          <span class="text-base font-medium text-blue-700">{{ task }}</span>
          <span class="text-sm font-medium text-blue-700">{{ progress }}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div class="bg-blue-600 h-2.5 rounded-full" :style="{width: progress + '%'}"></div>
        </div>
      </template>

      <template v-if="! installing">
        <div>
          <label for="model" class="block text-sm font-medium leading-6 text-gray-900">Model</label>
          <div class="mt-2">
            <select 
              name="model" 
              v-model="model"
              class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6">
              <option v-for="availableModel in availableModels" :key="availableModel.name" :value="availableModel.name">
                {{ availableModel.name }} ({{ availableModel.size }}GB free space required)
              </option>
            </select>
          </div>
        </div>
      </template>

      <div ref="terminal"></div>

      <template v-if="! installing">
        <button 
          class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" 
          @click="install">
          Install
        </button>
      </template>

      <button 
        v-else
        class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" 
        @click="stop">
        Stop
      </button>

      <button 
        v-if="installingModel && ! installing"
        class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" 
        @click="installingModel = false">
        Back to Playground
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import { onMounted, ref, computed, nextTick } from 'vue'
import { Terminal } from 'xterm';
import Playground from './components/Playground.vue'
import 'xterm/css/xterm.css'

let installedModels: Ref<string[]> = ref([]);
let task = ref('');
let installingModel = ref(false);
let installing = ref(false);
let progress = ref(0);
let terminal = ref(null);
let model = ref('7B');

let terminalWindow

let availableModels = computed(() => {
  let models = [
    { name: '7B', size: '~32' },
    { name: '13B', size: '~60' },
    { name: '30B', size: '~150' },
    { name: '65B', size: '~432' },
  ].filter((m) => ! installedModels.value.includes(m.name));

  model.value = models[0].name;

  return models;
})

onMounted(() => {
  terminalWindow = new Terminal();
  terminalWindow.open(terminal.value);

  loadInstalledModels();
})

function loadInstalledModels() {
  window.electron.ipcRenderer.invoke('getInstallationStatus').then((data) => {
    installedModels.value = data.models;
  })
}

function installModel() {
  installingModel.value = true;
  task.value = '';
  nextTick(() => {
    terminalWindow = new Terminal();
    terminalWindow.open(terminal.value);
  })
}

function install() {
  window.electron.ipcRenderer.send('installDalai', { model: model.value });
  installing.value = true;
}

function stop() {
  window.electron.ipcRenderer.send('stopDalai');
  installing.value = false;
}

window.electron.ipcRenderer.on('output', (_event, data) => {
  terminalWindow.write(data.msg);
})

window.electron.ipcRenderer.on('finished', () => {
  loadInstalledModels();
  installingModel.value = false;
})

window.electron.ipcRenderer.on('startProgress', (_event, data) => {
  task.value = data.task;
})

window.electron.ipcRenderer.on('progress', (_event, data) => {
  progress.value = data.percent;
})
</script>