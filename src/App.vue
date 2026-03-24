<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const MENSAJE_BIENVENIDA =
  'Listo para ayudarte con eventos historicos del dia. Toca el pulso para comenzar a hablar.';
const CLAVE_SESION_LOCAL = 'voicebot-historico-sesion-id';
const CLAVE_ULTIMO_EVENTO_LOCAL = 'voicebot-historico-ultimo-evento';
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const textoUsuario = ref('');
const mensajes = ref([
  {
    id: crypto.randomUUID(),
    rol: 'assistant',
    contenido: MENSAJE_BIENVENIDA,
  },
]);
const favoritos = ref([]);
const cargandoChat = ref(false);
const cargandoFavoritos = ref(false);
const mostrandoFavoritos = ref(false);
const cargandoHistorial = ref(false);
const eliminandoFavoritoId = ref('');
const toast = ref({
  visible: false,
  mensaje: '',
});
const error = ref('');
const reconocimientoDisponible = ref(
  Boolean(
    navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.RTCPeerConnection
  )
);
const escuchando = ref(false);
const reproduciendoAudio = ref(false);
const sesionId = ref('');
const conectandoSesion = ref(false);
const sesionRealtimeActiva = ref(false);
const ultimoEventoConsultado = ref(null);

let peerConnection = null;
let dataChannel = null;
let localStream = null;
let audioRemoto = null;
let conexionPromise = null;
let ultimoMensajeUsuarioPendiente = '';
let toastTimeout = null;

function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

const ultimoMensajeAsistente = computed(() => {
  return [...mensajes.value].reverse().find((mensaje) => mensaje.rol === 'assistant');
});

const resumenSesion = computed(() => {
  const ultimoUsuario = [...mensajes.value].reverse().find((mensaje) => mensaje.rol === 'user');

  if (!ultimoUsuario) {
    return 'Sin consultas recientes';
  }

  return ultimoUsuario.contenido;
});

const tituloHero = computed(() => {
  if (conectandoSesion.value) {
    return 'conectando voz en tiempo real';
  }

  if (escuchando.value) {
    return 'te estoy escuchando';
  }

  if (cargandoChat.value) {
    return 'estoy consultando';
  }

  if (reproduciendoAudio.value) {
    return 'respondiendo en voz';
  }

  if (sesionRealtimeActiva.value) {
    return 'ya podemos conversar';
  }

  return 'como puedo ayudarte hoy';
});

const subtituloHero = computed(() => {
  if (conectandoSesion.value) {
    return 'Estoy abriendo la sesion realtime con OpenAI para reducir la latencia de la conversacion.';
  }

  if (escuchando.value) {
    return 'Habla con naturalidad. La deteccion de voz cortara el turno y preparara la respuesta.';
  }

  if (cargandoChat.value) {
    return 'Procesando tu solicitud y ejecutando las consultas necesarias.';
  }

  if (reproduciendoAudio.value) {
    return 'La respuesta esta llegando como audio en tiempo real.';
  }

  if (sesionRealtimeActiva.value) {
    return 'Sesion activa. Puedes volver a tocar el pulso para abrir o cerrar el microfono.';
  }

  return 'VoiceBot usa audio en tiempo real. Toca el pulso para iniciar una sesion y hablar.';
});

const etiquetaPulso = computed(() => {
  if (conectandoSesion.value) {
    return 'Conectando';
  }

  if (escuchando.value) {
    return 'Microfono activo';
  }

  if (cargandoChat.value) {
    return 'Procesando';
  }

  if (sesionRealtimeActiva.value) {
    return 'Toca para hablar';
  }

  return 'Toca para iniciar';
});

function agregarMensaje(rol, contenido) {
  const texto = (contenido || '').trim();

  if (!texto) {
    return;
  }

  const ultimo = mensajes.value[mensajes.value.length - 1];

  if (ultimo && ultimo.rol === rol && ultimo.contenido === texto) {
    return;
  }

  mensajes.value.push({
    id: crypto.randomUUID(),
    rol,
    contenido: texto,
  });
}

function crearMensajeLocal(rol, contenido) {
  return {
    id: crypto.randomUUID(),
    rol,
    contenido,
  };
}

function construirMensajesDesdeHistorial(historial = []) {
  if (!historial.length) {
    return [crearMensajeLocal('assistant', MENSAJE_BIENVENIDA)];
  }

  return historial.map((item) =>
    crearMensajeLocal(item.rol, item.contenido)
  );
}

function obtenerSesionId() {
  const sesionGuardada = window.localStorage.getItem(CLAVE_SESION_LOCAL);

  if (sesionGuardada) {
    sesionId.value = sesionGuardada;
    return sesionGuardada;
  }

  const nuevaSesionId = crypto.randomUUID();
  sesionId.value = nuevaSesionId;
  window.localStorage.setItem(CLAVE_SESION_LOCAL, nuevaSesionId);
  return nuevaSesionId;
}

async function cargarFavoritos() {
  cargandoFavoritos.value = true;

  try {
    const endpoint = sesionId.value
      ? `/api/eventos-guardados/sesion/${sesionId.value}`
      : '/api/eventos-guardados';
    const response = await fetch(apiUrl(endpoint));
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'No fue posible cargar favoritos.');
    }

    favoritos.value = result.data;
  } catch (err) {
    error.value = err.message;
  } finally {
    cargandoFavoritos.value = false;
  }
}

async function abrirFavoritos() {
  mostrandoFavoritos.value = true;
  await cargarFavoritos();
}

function cerrarFavoritos() {
  mostrandoFavoritos.value = false;
}

function mostrarToast(mensaje) {
  if (toastTimeout) {
    window.clearTimeout(toastTimeout);
  }

  toast.value = {
    visible: true,
    mensaje,
  };

  toastTimeout = window.setTimeout(() => {
    toast.value.visible = false;
    toastTimeout = null;
  }, 2600);
}

async function persistirInteraccion(mensajeUsuario, respuestaAsistente) {
  if (!sesionId.value || !mensajeUsuario || !respuestaAsistente) {
    return;
  }

  const response = await fetch(apiUrl(`/api/realtime/sessions/${sesionId.value}/messages`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mensajeUsuario,
      respuestaAsistente,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || 'No fue posible guardar la conversacion.');
  }
}

function registrarMensajeUsuarioPendiente(texto) {
  const mensaje = (texto || '').trim();

  if (!mensaje) {
    return;
  }

  agregarMensaje('user', mensaje);
  ultimoMensajeUsuarioPendiente = mensaje;
}

function registrarRespuestaAsistente(texto) {
  const respuesta = (texto || '').trim();

  if (!respuesta) {
    return;
  }

  agregarMensaje('assistant', respuesta);

  const mensajeUsuario = ultimoMensajeUsuarioPendiente;
  ultimoMensajeUsuarioPendiente = '';

  if (!mensajeUsuario) {
    return;
  }

  persistirInteraccion(mensajeUsuario, respuesta).catch((err) => {
    error.value = err.message;
  });
}

function normalizarTexto(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function esSaludoSimple(texto) {
  const normalizado = normalizarTexto(texto);

  return [
    'hola',
    'holi',
    'buenas',
    'buen dia',
    'buenos dias',
    'buenas tardes',
    'buenas noches',
    'hey',
  ].some(
    (saludo) => normalizado === saludo || normalizado.startsWith(`${saludo} `)
  );
}

function guardarUltimoEventoConsultado(evento) {
  ultimoEventoConsultado.value = evento || null;

  if (!sesionId.value) {
    return;
  }

  if (!evento) {
    window.localStorage.removeItem(`${CLAVE_ULTIMO_EVENTO_LOCAL}:${sesionId.value}`);
    return;
  }

  window.localStorage.setItem(
    `${CLAVE_ULTIMO_EVENTO_LOCAL}:${sesionId.value}`,
    JSON.stringify(evento)
  );
}

function cargarUltimoEventoConsultado() {
  if (!sesionId.value) {
    ultimoEventoConsultado.value = null;
    return;
  }

  const guardado = window.localStorage.getItem(
    `${CLAVE_ULTIMO_EVENTO_LOCAL}:${sesionId.value}`
  );

  if (!guardado) {
    ultimoEventoConsultado.value = null;
    return;
  }

  try {
    ultimoEventoConsultado.value = JSON.parse(guardado);
  } catch {
    ultimoEventoConsultado.value = null;
    window.localStorage.removeItem(`${CLAVE_ULTIMO_EVENTO_LOCAL}:${sesionId.value}`);
  }
}

async function cargarHistorialSesionActual(sesionObjetivo = sesionId.value) {
  if (!sesionObjetivo) {
    mensajes.value = [crearMensajeLocal('assistant', MENSAJE_BIENVENIDA)];
    return;
  }

  cargandoHistorial.value = true;

  try {
    const response = await fetch(apiUrl(`/api/realtime/sessions/${sesionObjetivo}/messages`));
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'No fue posible recuperar el historial.');
    }

    mensajes.value = construirMensajesDesdeHistorial(result.data);
    ultimoMensajeUsuarioPendiente = '';
  } catch (err) {
    error.value = err.message;
  } finally {
    cargandoHistorial.value = false;
  }
}

async function eliminarFavorito(eventoId) {
  if (!eventoId || eliminandoFavoritoId.value) {
    return;
  }

  eliminandoFavoritoId.value = eventoId;

  try {
    const query = sesionId.value
      ? `?sesionId=${encodeURIComponent(sesionId.value)}`
      : '';
    const response = await fetch(apiUrl(`/api/eventos-guardados/${eventoId}${query}`), {
      method: 'DELETE',
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'No fue posible eliminar el favorito.');
    }

    favoritos.value = favoritos.value.filter((favorito) => favorito.id !== eventoId);
  } catch (err) {
    error.value = err.message;
  } finally {
    eliminandoFavoritoId.value = '';
  }
}

function garantizarAudioRemoto() {
  if (audioRemoto) {
    return audioRemoto;
  }

  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.playsInline = true;

  audio.addEventListener('playing', () => {
    reproduciendoAudio.value = true;
  });

  audio.addEventListener('pause', () => {
    reproduciendoAudio.value = false;
  });

  audio.addEventListener('ended', () => {
    reproduciendoAudio.value = false;
  });

  audioRemoto = audio;
  return audio;
}

async function reproducirRespuestaLocal(texto) {
  try {
    const response = await fetch(apiUrl('/api/voz'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ texto }),
    });

    if (!response.ok) {
      throw new Error('No fue posible generar el audio.');
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    reproduciendoAudio.value = true;

    audio.onended = () => {
      reproduciendoAudio.value = false;
      URL.revokeObjectURL(audioUrl);
    };

    audio.onerror = () => {
      reproduciendoAudio.value = false;
      URL.revokeObjectURL(audioUrl);
    };

    await audio.play();
  } catch (err) {
    reproduciendoAudio.value = false;
    error.value = err.message;
  }
}

async function resolverConsultaControlada(texto) {
  cargandoChat.value = true;

  try {
    const response = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mensaje: texto,
        sesionId: sesionId.value,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'No fue posible procesar la consulta.');
    }

    const data = result.data || {};

    if (data.meta?.ultimoEventoConsultado) {
      guardarUltimoEventoConsultado(data.meta.ultimoEventoConsultado);
    }

    if (data.meta?.favoritoGuardado) {
      const favorito = data.meta.favoritoGuardado;
      favoritos.value = [
        favorito,
        ...favoritos.value.filter((item) => item.id !== favorito.id),
      ];
      mostrarToast(`Se agrego a favoritos: ${favorito.titulo}`);
      await cargarFavoritos();
    }

    if (Array.isArray(data.meta?.favoritos)) {
      favoritos.value = data.meta.favoritos;
    }

    registrarRespuestaAsistente(data.respuesta || 'No hubo respuesta disponible.');
    await reproducirRespuestaLocal(data.respuesta || 'No hubo respuesta disponible.');
  } finally {
    cargandoChat.value = false;
  }
}

function enviarEventoRealtime(evento) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    throw new Error('El canal realtime aun no esta listo.');
  }

  dataChannel.send(JSON.stringify(evento));
}

function habilitarMicrofono(activo) {
  if (!localStream) {
    return;
  }

  localStream.getAudioTracks().forEach((track) => {
    track.enabled = activo;
  });

  escuchando.value = activo;
}

function manejarEventoRealtime(payload) {
  switch (payload.type) {
    case 'session.created':
    case 'session.updated':
      sesionRealtimeActiva.value = true;
      return;
    case 'input_audio_buffer.speech_started':
      escuchando.value = true;
      return;
    case 'input_audio_buffer.speech_stopped':
      escuchando.value = false;
      cargandoChat.value = true;
      return;
    case 'conversation.item.input_audio_transcription.completed':
      registrarMensajeUsuarioPendiente(payload.transcript);

      if (esSaludoSimple(payload.transcript)) {
        const respuesta = 'Hola, que hecho historico quieres consultar?';
        registrarRespuestaAsistente(respuesta);
        cargandoChat.value = false;
        return;
      }

      resolverConsultaControlada(payload.transcript)
        .catch((err) => {
          error.value = err.message;
          cargandoChat.value = false;
        });
      return;
    case 'error':
      error.value = payload.error?.message || 'Ocurrio un error en la sesion realtime.';
      cargandoChat.value = false;
      escuchando.value = false;
      return;
    default:
      return;
  }
}

function configurarSesionRealtime(configuracion) {
  enviarEventoRealtime({
    type: 'session.update',
    session: {
      instructions: configuracion.instructions,
      voice: configuracion.voice,
      modalities: ['audio', 'text'],
      input_audio_transcription: {
        model: configuracion.transcriptionModel,
      },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: false,
        interrupt_response: true,
      },
    },
  });
}

async function iniciarSesionRealtime() {
  if (!reconocimientoDisponible.value) {
    throw new Error(
      'Tu navegador no soporta los elementos necesarios para audio en tiempo real.'
    );
  }

  conectandoSesion.value = true;
  error.value = '';

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });

  peerConnection = new RTCPeerConnection();
  garantizarAudioRemoto();

  peerConnection.ontrack = (event) => {
    const audio = garantizarAudioRemoto();
    audio.srcObject = event.streams[0];
  };

  localStream.getTracks().forEach((track) => {
    track.enabled = false;
    peerConnection.addTrack(track, localStream);
  });

  dataChannel = peerConnection.createDataChannel('oai-events');

  dataChannel.addEventListener('message', (event) => {
    try {
      manejarEventoRealtime(JSON.parse(event.data));
    } catch {
      // no-op
    }
  });

  const dataChannelAbierto = new Promise((resolve) => {
    dataChannel.addEventListener(
      'open',
      () => {
        sesionRealtimeActiva.value = true;
        resolve();
      },
      { once: true }
    );
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const response = await fetch(apiUrl('/api/realtime/session'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sdp: offer.sdp,
      sesionId: sesionId.value,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || 'No fue posible iniciar la sesion realtime.');
  }

  await peerConnection.setRemoteDescription({
    type: 'answer',
    sdp: result.data.answerSdp,
  });

  await dataChannelAbierto;
  configurarSesionRealtime(result.data.configuracion);
  habilitarMicrofono(true);
}

async function asegurarSesionRealtime() {
  if (sesionRealtimeActiva.value && dataChannel?.readyState === 'open') {
    return;
  }

  if (conexionPromise) {
    return conexionPromise;
  }

  conexionPromise = (async () => {
    try {
      await iniciarSesionRealtime();
    } finally {
      conectandoSesion.value = false;
      conexionPromise = null;
    }
  })();

  return conexionPromise;
}

async function alternarEscucha() {
  try {
    if (!sesionRealtimeActiva.value || dataChannel?.readyState !== 'open') {
      await asegurarSesionRealtime();
      return;
    }

    const activo = localStream?.getAudioTracks().some((track) => track.enabled);

    habilitarMicrofono(!activo);
  } catch (err) {
    conectandoSesion.value = false;
    error.value = err.message;
  }
}

async function enviarTextoManual() {
  const mensaje = textoUsuario.value.trim();

  if (!mensaje || cargandoChat.value) {
    return;
  }

  try {
    registrarMensajeUsuarioPendiente(mensaje);

    if (esSaludoSimple(mensaje)) {
      const respuesta = 'Hola, que hecho historico quieres consultar?';
      registrarRespuestaAsistente(respuesta);
      textoUsuario.value = '';
      return;
    }

    textoUsuario.value = '';
    await resolverConsultaControlada(mensaje);
  } catch (err) {
    error.value = err.message;
  }
}

async function usarAccesoRapido(texto) {
  textoUsuario.value = texto;
  await enviarTextoManual();
}

function formatearFecha(fecha) {
  if (!fecha) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(fecha));
}

function cerrarSesionRealtime() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  if (audioRemoto) {
    audioRemoto.pause();
    audioRemoto.srcObject = null;
    audioRemoto = null;
  }

  conectandoSesion.value = false;
  sesionRealtimeActiva.value = false;
  escuchando.value = false;
  reproduciendoAudio.value = false;
  cargandoChat.value = false;
}

onMounted(async () => {
  obtenerSesionId();
  cargarUltimoEventoConsultado();
  await Promise.all([cargarFavoritos(), cargarHistorialSesionActual()]);
});

onBeforeUnmount(() => {
  if (toastTimeout) {
    window.clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  cerrarSesionRealtime();
});
</script>

<template>
  <div class="app-shell">
    <div class="voicebot-shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <div class="brand-block">
            <h1>VoiceBot</h1>
            <span>Asistente historico</span>
          </div>

          <button class="new-session-button" type="button" @click="alternarEscucha">
            <FontAwesomeIcon icon="fa-solid fa-plus" />
            {{ sesionRealtimeActiva ? 'Alternar microfono' : 'Iniciar sesion de voz' }}
          </button>

          <button class="nav-item muted nav-item--counter" type="button">
            <FontAwesomeIcon icon="fa-solid fa-circle-question" />
            <span>{{ favoritos.length }} favoritos en sesion</span>
          </button>

          <form class="sidebar-input" @submit.prevent="enviarTextoManual">
            <label for="sidebar-texto" class="sidebar-input__label">Escribir</label>
            <div class="sidebar-input__control">
              <input
                id="sidebar-texto"
                v-model="textoUsuario"
                type="text"
                placeholder="Escribe si prefieres no hablar"
              />
              <button type="submit" :disabled="cargandoChat || !textoUsuario.trim()">
                <FontAwesomeIcon icon="fa-solid fa-paper-plane" />
              </button>
            </div>
          </form>

          <nav class="sidebar-nav">
            <button class="nav-item active" type="button" @click="alternarEscucha">
              <FontAwesomeIcon icon="fa-solid fa-microphone" />
              <span>Asistente</span>
            </button>
            <button
              class="nav-item"
              type="button"
              :disabled="!ultimoMensajeAsistente"
              @click="usarAccesoRapido('Muestrame mis favoritos')"
            >
              <FontAwesomeIcon icon="fa-solid fa-clock-rotate-left" />
              <span>Reanudar contexto</span>
            </button>
            <button class="nav-item" type="button" @click="abrirFavoritos">
              <FontAwesomeIcon icon="fa-solid fa-bookmark" />
              <span>{{ cargandoFavoritos ? 'Cargando' : 'Favoritos' }}</span>
            </button>
            <button class="nav-item" type="button" @click="cerrarSesionRealtime">
              <FontAwesomeIcon icon="fa-solid fa-gear" />
              <span>{{ sesionRealtimeActiva ? 'Cerrar sesion' : '' }}</span>
            </button>
          </nav>
        </div>

        <div class="sidebar-bottom"></div>
      </aside>

      <main class="hero-stage">
        <section class="hero-panel">
          <div class="hero-copy">
            <h2>{{ tituloHero }}</h2>
            <p>{{ subtituloHero }}</p>
          </div>

          <div class="pulse-area">
            <button
              type="button"
              class="pulse-button"
              :class="{
                listening: escuchando,
                processing: cargandoChat || conectandoSesion,
                speaking: reproduciendoAudio,
              }"
              :disabled="conectandoSesion || !reconocimientoDisponible"
              @click="alternarEscucha"
            >
              <span class="pulse-ring ring-one"></span>
              <span class="pulse-ring ring-two"></span>
              <span class="pulse-ring ring-three"></span>
              <FontAwesomeIcon icon="fa-solid fa-microphone" />
            </button>
            <span class="pulse-label">{{ etiquetaPulso }}</span>
          </div>

          <div class="quick-grid">
            <button
              type="button"
              class="quick-card"
              @click="usarAccesoRapido('Que paso un dia como hoy en la historia?')"
            >
              <span class="quick-label">Consulta rapida</span>
              <strong>"Que paso un dia como hoy?"</strong>
            </button>
            <button
              type="button"
              class="quick-card"
              @click="usarAccesoRapido('Dame un evento historico sobre ciencia')"
            >
              <span class="quick-label">Rutina</span>
              <strong>"Dame un evento historico sobre ciencia"</strong>
            </button>
          </div>

          <div class="minimal-console">
            <div class="console-row">
              <span class="console-label">Ultima consulta</span>
              <button
                type="button"
                class="console-voice"
                :disabled="!ultimoMensajeAsistente"
                @click="reproducirRespuestaLocal(ultimoMensajeAsistente?.contenido)"
              >
                <FontAwesomeIcon icon="fa-solid fa-volume-high" />
              </button>
            </div>
            <span v-if="cargandoHistorial" class="console-meta">Cargando mensajes recientes...</span>
            <p>{{ resumenSesion }}</p>
          </div>

          <p v-if="error" class="error-banner">{{ error }}</p>
        </section>

      </main>

      <transition name="favorites-panel">
        <aside v-if="mostrandoFavoritos" class="favorites-drawer">
          <div class="favorites-drawer__backdrop" @click="cerrarFavoritos"></div>
          <section class="favorites-drawer__panel">
            <div class="favorites-drawer__header">
              <div>
                <span class="favorites-drawer__eyebrow">Favoritos</span>
                <h3>Eventos guardados</h3>
              </div>
              <button type="button" class="favorites-drawer__close" @click="cerrarFavoritos">
                <FontAwesomeIcon icon="fa-solid fa-xmark" />
              </button>
            </div>

            <div class="favorites-drawer__body">
              <p v-if="cargandoFavoritos" class="favorites-drawer__state">Cargando favoritos...</p>

              <ul v-else-if="favoritos.length" class="favorites-list">
                <li v-for="favorito in favoritos" :key="favorito.id" class="favorites-list__item">
                  <div class="favorites-list__meta">
                    <span>{{ formatearFecha(favorito.fecha_evento) }}</span>
                    <button
                      type="button"
                      class="favorites-list__delete"
                      :disabled="eliminandoFavoritoId === favorito.id"
                      @click="eliminarFavorito(favorito.id)"
                    >
                      <FontAwesomeIcon icon="fa-solid fa-trash" />
                      {{ eliminandoFavoritoId === favorito.id ? 'Eliminando' : 'Eliminar' }}
                    </button>
                  </div>
                  <strong>{{ favorito.titulo }}</strong>
                </li>
              </ul>

              <p v-else class="favorites-drawer__state">Aun no hay favoritos en esta sesion.</p>
            </div>
          </section>
        </aside>
      </transition>

      <transition name="toast">
        <div v-if="toast.visible" class="app-toast">
          {{ toast.mensaje }}
        </div>
      </transition>
    </div>
  </div>
</template>
