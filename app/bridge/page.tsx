'use client'

import { useEffect } from 'react'
import { saveSharedAudioFile } from '@/lib/sharedDB'

export default function BridgePage() {
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Only accept messages from directpodcast.fr
      if (event.origin !== 'https://directpodcast.fr') return

      if (event.data.type === 'SAVE_AUDIO_DATA') {
        const { messageId, data } = event.data

        try {
          // Save audio data to IndexedDB
          await saveSharedAudioFile(
            data.filename,
            data.fileType,
            data.arrayBuffer
          )

          // Send success response
          event.source?.postMessage(
            {
              type: 'AUDIO_DATA_SAVED',
              messageId,
            },
            { targetOrigin: event.origin }
          )
        } catch (error) {
          // Send error response
          event.source?.postMessage(
            {
              type: 'AUDIO_DATA_ERROR',
              messageId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            { targetOrigin: event.origin }
          )
        }
      }
    }

    // Listen for messages
    window.addEventListener('message', handleMessage)

    // Notify parent that bridge is ready
    window.parent.postMessage(
      { type: 'BRIDGE_READY' },
      'https://directpodcast.fr'
    )

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        left: '-9999px',
        width: '1px',
        height: '1px',
        opacity: 0,
      }}
    >
      Bridge
    </div>
  )
}
