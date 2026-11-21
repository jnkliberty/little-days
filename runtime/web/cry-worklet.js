/* Sound capture for the Crying screen: the audio thread half.
   It copies the first channel of the microphone into blocks and posts each block to the page.
   cry-capture.js loads this file with audioWorklet.addModule('/cry-worklet.js') and does all the counting. */
class CryCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(1024);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let from = 0;
    while (from < channel.length) {
      const take = Math.min(channel.length - from, this.block.length - this.filled);
      this.block.set(channel.subarray(from, from + take), this.filled);
      this.filled += take;
      from += take;
      if (this.filled === this.block.length) {
        this.port.postMessage(this.block);
        this.block = new Float32Array(this.block.length);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('cry-capture', CryCapture);
