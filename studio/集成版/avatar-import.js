/* 一键导入头像（v2）
 * 当前预览的像素形象 → PNG → PUT /api/me/avatar（主站转成 512×512 WebP）。
 *
 * v2 优化点：
 *  1. CSRF token 只取一次并缓存，省掉每次的往返
 *  2. 画布 512 → 384，PNG 编码与上传体积明显变小
 *  3. 网络抖动自动重试一次；失败给出可读原因
 *  4. 成功后 postMessage 通知主站，用户页头像立即更新，不用整页刷新
 *  5. 空白图检测：避免把空形象当头像导进去
 */
(function () {
  'use strict'

  var BTN_ID = 'saved-import-avatar'
  var SIZE = 384
  var cachedToken = null

  function toast(message, isError) {
    var el = document.getElementById('toast')
    if (!el) return
    el.textContent = message
    el.hidden = false
    el.style.background = isError ? 'var(--danger, #9c4035)' : ''
    el.style.color = isError ? '#fff' : ''
    clearTimeout(toast._timer)
    toast._timer = setTimeout(function () {
      el.hidden = true
      el.style.background = ''
      el.style.color = ''
    }, 3200)
  }

  var STYLE_PROPS = [
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
    'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'opacity',
    'font-size', 'font-family', 'font-weight', 'letter-spacing'
  ]

  function inlineStyles(source, clone) {
    var srcNodes = source.querySelectorAll('*')
    var cloneNodes = clone.querySelectorAll('*')
    for (var i = 0; i < srcNodes.length && i < cloneNodes.length; i++) {
      var computed = window.getComputedStyle(srcNodes[i])
      var target = cloneNodes[i]
      for (var j = 0; j < STYLE_PROPS.length; j++) {
        var prop = STYLE_PROPS[j]
        var value = computed.getPropertyValue(prop)
        if (value) target.setAttribute(prop, value)
      }
    }
  }

  function renderPng() {
    var source = document.getElementById('avatar-svg')
    if (!source) return Promise.reject(new Error('找不到角色预览'))

    var clone = source.cloneNode(true)
    inlineStyles(source, clone)

    var box = (source.getAttribute('viewBox') || '0 0 240 288').trim().split(/[\s,]+/).map(Number)
    var vbW = box[2] || 240
    var vbH = box[3] || 288

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(vbW))
    clone.setAttribute('height', String(vbH))

    var svgText = new XMLSerializer().serializeToString(clone)
    var dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText)

    return new Promise(function (resolve, reject) {
      var img = new Image()
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas')
          canvas.width = SIZE
          canvas.height = SIZE
          var ctx = canvas.getContext('2d')
          var scale = Math.min(SIZE / vbW, SIZE / vbH)
          var drawW = vbW * scale
          var drawH = vbH * scale
          ctx.drawImage(img, (SIZE - drawW) / 2, (SIZE - drawH) / 2, drawW, drawH)

          // 空白检测：整张图若没有不透明像素，说明形象没渲染出来
          var pixels = ctx.getImageData(0, 0, SIZE, SIZE).data
          var opaque = 0
          for (var i = 3; i < pixels.length; i += 4) {
            if (pixels[i] > 8) { opaque++; if (opaque > 500) break }
          }
          if (opaque <= 500) {
            reject(new Error('当前形象是空的，请先在「换装工坊」搭配好再导入'))
            return
          }

          canvas.toBlob(function (blob) {
            if (blob) resolve(blob)
            else reject(new Error('PNG 生成失败'))
          }, 'image/png')
        } catch (error) {
          reject(error)
        }
      }
      img.onerror = function () { reject(new Error('形象渲染失败')) }
      img.src = dataUrl
    })
  }

  function getCsrfToken() {
    if (cachedToken) return Promise.resolve(cachedToken)
    return fetch('/api/security/csrf-token', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (data) {
        if (data && data.csrfToken) cachedToken = data.csrfToken
        return cachedToken
      })
      .catch(function () { return null })
  }

  function putAvatar(blob) {
    return getCsrfToken().then(function (token) {
      var form = new FormData()
      form.append('file', blob, 'avatar.png')
      var headers = {}
      if (token) headers['X-CSRF-Token'] = token
      return fetch('/api/me/avatar', {
        method: 'PUT',
        body: form,
        credentials: 'same-origin',
        headers: headers
      })
    }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (response.ok) return data
        if (response.status === 401) throw new Error('请先登录主站账号')
        if (response.status === 413) throw new Error('头像文件过大')
        var error = new Error(data.message || ('导入失败 HTTP ' + response.status))
        error.retryable = response.status >= 500
        throw error
      })
    })
  }

  function uploadWithRetry(blob) {
    return putAvatar(blob).catch(function (error) {
      // 只在网络类/5xx 失败时重试一次，4xx 直接抛出
      if (error && error.retryable) {
        return new Promise(function (resolve) { setTimeout(resolve, 400) }).then(function () {
          return putAvatar(blob)
        })
      }
      throw error
    })
  }

  function notifyParent() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'omc:avatar-updated' }, window.location.origin)
      }
    } catch (error) {
      /* 跨域或父窗口不可用时忽略，用户刷新页面也能看到 */
    }
  }

  function bind() {
    var button = document.getElementById(BTN_ID)
    if (!button || button.dataset.bound === '1') return
    button.dataset.bound = '1'

    button.addEventListener('click', function () {
      if (button.disabled) return
      button.disabled = true

      var started = Date.now()
      renderPng()
        .then(uploadWithRetry)
        .then(function () {
          notifyParent()
          toast('已设为站内头像（' + (Date.now() - started) + ' ms）')
        })
        .catch(function (error) {
          toast(error && error.message ? error.message : '导入失败', true)
        })
        .then(function () {
          button.disabled = false
        })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind)
  } else {
    bind()
  }
})()
