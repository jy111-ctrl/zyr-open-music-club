/** 迭代式 radix-2 FFT（原地运算），供指纹与频谱分析复用。 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < half; k += 1) {
        const i0 = i + k
        const i1 = i0 + half
        const vRe = re[i1] * curRe - im[i1] * curIm
        const vIm = re[i1] * curIm + im[i1] * curRe
        const uRe = re[i0]
        const uIm = im[i0]
        re[i0] = uRe + vRe
        im[i0] = uIm + vIm
        re[i1] = uRe - vRe
        im[i1] = uIm - vIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}
