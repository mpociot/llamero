<template>
  <div class="flex flex-col space-y-4">

    <div>
      <label for="model" class="block text-sm font-medium leading-6 text-gray-900">Model</label>
      <div class="mt-2">
        <select 
          name="model" 
          v-model="model"
          class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6">
          <option v-for="installedModel in props.installedModels" :key="installedModel" :value="installedModel">{{ installedModel }}</option>
          <option value="">Install additional models</option>
        </select>
      </div>
    </div>

    <div class="flex flex-col space-y-4">
      <div class="flex items-center justify-between group">
        <label for="max_length" class="block text-sm font-medium leading-6 text-gray-900">Maximum length</label>
        <div>
          <input 
            id="max_length"
            class="block rounded-md border-0 py-0 w-16 text-gray-900 group-hover:ring-1 group-hover:shadow-sm ring-0 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm text-right p-0 pr-1"
            type="number" v-model="nPredict" />
        </div>
      </div>
      <input 
        type="range" 
        class="bg-gray-300 rounded-full h-2.5"
        v-model="nPredict" min="1" max="2048" />
    </div>

    <div class="flex flex-col space-y-4">
      <div class="flex items-center justify-between group">
        <label for="temperature" class="block text-sm font-medium leading-6 text-gray-900">Temperature</label>
        <div>
          <input 
            id="temperature"
            step="0.1"
            class="block rounded-md border-0 py-0 w-16 text-gray-900 group-hover:ring-1 group-hover:shadow-sm ring-0 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm text-right p-0 pr-1"
            type="number" v-model="temperature" />
        </div>
      </div>
      <input 
        type="range" 
        class="bg-gray-300 rounded-full h-2.5"
        v-model="temperature" min="0" max="1" step="0.1" />
    </div>

    <textarea v-model="prompt" placeholder="I believe the meaning of life is" />

    <button 
      class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center" 
      @click="queryModel">
      <template v-if="queryRunning">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      </template>
      <template v-else>
        Run
      </template>
    </button>

    <pre class="whitespace-pre-wrap">{{ queryOutput }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  installedModels: string[]
}>()

const emit = defineEmits<{
  (e: 'installModel'): void
}>()

let prompt = ref('')
let queryRunning = ref(false);
let queryOutput = ref('');
let model = ref('7B');
let nPredict = ref(128);
let temperature = ref(1.0);

watch(model, (newModel) => {
  if (newModel === '') {
    emit('installModel')
  }
})


function queryModel() {
  queryOutput.value = '';
  queryRunning.value = true;

  window.electron.ipcRenderer.send('queryDalai', {
    model: '7B',
    prompt: prompt.value,
    nPredict: nPredict.value,
    temperature: temperature.value,
  });
}

window.electron.ipcRenderer.on('queryOutput', (_event, data) => {
  queryOutput.value += data.msg;
})

window.electron.ipcRenderer.on('queryFinished', () => {
  queryRunning.value = false;
})
</script>
