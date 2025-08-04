import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function initFFmpeg() {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

export async function cropAudio(
  file: File,
  startTime: number,
  endTime: number
): Promise<Blob> {
  const ffmpeg = await initFFmpeg();
  
  const timestamp = Date.now();
  const inputName = `input_${timestamp}.wav`;
  const outputName = `output_${timestamp}.wav`;
  
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  
  const duration = endTime - startTime;
  
  await ffmpeg.exec([
    '-i', inputName,
    '-ss', startTime.toString(),
    '-t', duration.toString(),
    '-acodec', 'pcm_s16le',
    outputName
  ]);
  
  const data = await ffmpeg.readFile(outputName);
  
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);
  
  return new Blob([data], { type: 'audio/wav' });
}

export async function adjustGain(
  file: File,
  gain: number,
  region?: { start: number; end: number }
): Promise<Blob> {
  const ffmpeg = await initFFmpeg();
  
  const timestamp = Date.now();
  const inputName = `input_gain_${timestamp}.wav`;
  const outputName = `output_gain_${timestamp}.wav`;
  
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  
  if (region) {
    // Apply gain only to the selected region
    const beforeName = `before_${timestamp}.wav`;
    const regionName = `region_${timestamp}.wav`;
    const afterName = `after_${timestamp}.wav`;
    const concatList = `concat_${timestamp}.txt`;
    
    // Extract parts
    await ffmpeg.exec([
      '-i', inputName,
      '-t', region.start.toString(),
      '-acodec', 'copy',
      beforeName
    ]);
    
    await ffmpeg.exec([
      '-i', inputName,
      '-ss', region.start.toString(),
      '-t', (region.end - region.start).toString(),
      '-af', `volume=${gain}`,
      '-acodec', 'pcm_s16le',
      regionName
    ]);
    
    await ffmpeg.exec([
      '-i', inputName,
      '-ss', region.end.toString(),
      '-acodec', 'copy',
      afterName
    ]);
    
    // Create concat list
    await ffmpeg.writeFile(concatList, `file '${beforeName}'\nfile '${regionName}'\nfile '${afterName}'`);
    
    // Concatenate
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-acodec', 'pcm_s16le',
      outputName
    ]);
    
    // Cleanup
    await ffmpeg.deleteFile(beforeName);
    await ffmpeg.deleteFile(regionName);
    await ffmpeg.deleteFile(afterName);
    await ffmpeg.deleteFile(concatList);
  } else {
    // Apply gain to entire file
    const volumeFilter = `volume=${gain}`;
    
    await ffmpeg.exec([
      '-i', inputName,
      '-af', volumeFilter,
      '-acodec', 'pcm_s16le',
      outputName
    ]);
  }
  
  const data = await ffmpeg.readFile(outputName);
  
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);
  
  return new Blob([data], { type: 'audio/wav' });
}