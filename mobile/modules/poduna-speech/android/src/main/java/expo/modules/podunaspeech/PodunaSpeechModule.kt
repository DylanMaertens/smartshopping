package expo.modules.podunaspeech

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Strictly on-device: never instantiate the default (potentially remote) service. */
class PodunaSpeechModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var pending: Promise? = null
  private val timeout = Runnable { fail("E_TIMEOUT") }

  override fun definition() = ModuleDefinition {
    Name("PodunaSpeech")

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext
      context != null && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("recognize") { language: String, promise: Promise ->
      val context = appContext.reactContext
      if (pending != null) {
        promise.reject("E_BUSY", "Recognition already active", null)
      } else if (context == null || Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
        promise.reject("E_UNAVAILABLE", "On-device recognition unavailable", null)
      } else if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        promise.reject("E_PERMISSION", "Microphone permission required", null)
      } else {
        pending = promise
        try {
          val service = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
          recognizer = service
          service.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {} // Never retain audio.
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onError(error: Int) {
              if (recognizer !== service) return
              fail(when (error) {
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "E_PERMISSION"
                SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "E_LANGUAGE"
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "E_NO_SPEECH"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "E_BUSY"
                else -> "E_RECOGNITION"
              })
            }
            override fun onResults(results: Bundle?) {
              if (recognizer !== service) return
              val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
              if (text.isNullOrEmpty()) { fail("E_NO_SPEECH"); return }
              val result = pending
              release()
              result?.resolve(text)
            }
          })
          val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
          }
          main.postDelayed(timeout, 45_000)
          service.startListening(intent)
        } catch (_: Exception) { fail("E_RECOGNITION") }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      try { recognizer?.stopListening() } catch (_: Exception) { fail("E_RECOGNITION") }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("cancel") { fail("E_CANCELLED") }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground { main.post { fail("E_CANCELLED") } }
    OnDestroy { main.post { fail("E_CANCELLED") } }
  }

  private fun fail(code: String) {
    val result = pending
    release()
    result?.reject(code, code, null)
  }

  private fun release() {
    main.removeCallbacks(timeout)
    val old = recognizer
    recognizer = null
    pending = null
    try { old?.cancel() } catch (_: Exception) {}
    try { old?.destroy() } catch (_: Exception) {}
  }
}
