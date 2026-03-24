import { createApp } from 'vue';
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import {
  faArrowRightFromBracket,
  faBookmark,
  faClock,
  faClockRotateLeft,
  faCircleQuestion,
  faGear,
  faMicrophone,
  faPaperPlane,
  faPlus,
  faRotateRight,
  faVolumeHigh,
  faWaveSquare,
  faXmark,
  faFlask,
  faBoxArchive,
  faTrash,
  faCopy,
} from '@fortawesome/free-solid-svg-icons';
import App from './App.vue';
import './style.css';

library.add(
  faArrowRightFromBracket,
  faBookmark,
  faClock,
  faClockRotateLeft,
  faCircleQuestion,
  faGear,
  faMicrophone,
  faPaperPlane,
  faPlus,
  faRotateRight,
  faVolumeHigh,
  faWaveSquare,
  faXmark,
  faFlask,
  faBoxArchive,
  faTrash,
  faCopy
);

const app = createApp(App);

app.component('FontAwesomeIcon', FontAwesomeIcon);

app.mount('#app');
