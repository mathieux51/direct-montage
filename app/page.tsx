'use client'

import Editor from '@/components/Editor'

export default function Home() {
  return (
    <div className='min-h-screen py-6 sm:py-8'>
      <div className='max-w-6xl mx-auto px-4'>
        <h1 className='text-3xl font-normal text-white mb-6 sm:mb-8 uppercase'>
          Direct Montage
        </h1>
        <Editor />
      </div>
    </div>
  )
}
