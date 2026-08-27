/**
 * 生成 tabBar 图标 PNG（81x81 RGBA），不依赖任何图像库。
 *
 * 小程序 tabBar 必须有本地图标文件，而项目里没有设计资源；
 * 用 Node 内置 zlib + 手写 PNG 分块直接产出，避免为了两张图引入 sharp/jimp。
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 81

/**
 * 图标颜色从 constants/theme.ts 读，不在这里重复一份字面值。
 *
 * 为什么：PNG 是烘焙的，主题一改就会和 tabBar 的 selectedColor / color 出现色差，
 * 而这种色差在开发者工具里很容易被当成"渲染抖动"忽略掉。
 * 旧版本这里写死过 #1f6f54（旧 primary）与 #8a8f99（连当时 theme.ts 的 #9ba5a0 都不一致），
 * 2026-08-28 换主题时才暴露出来。
 */
const themeSrc = fs.readFileSync(path.resolve(__dirname, '../src/constants/theme.ts'), 'utf8')
function themeColor (key) {
  const matched = new RegExp(`${key}:\\s*'#([0-9a-f]{6})'`, 'i').exec(themeSrc)
  if (!matched) {
    throw new Error(`无法从 constants/theme.ts 解析 ${key}，图标颜色会失去来源`)
  }
  const hex = matched[1]
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}
const COLOR_ACTIVE = themeColor('primary')
const COLOR_INACTIVE = themeColor('tabBarInactive')

// ---------- PNG 编码 ----------
/** gAMA 需为整数干分之一，1/2.2 约为 45455，sRGB 内容用这个值是惯例 */
const gamma = Buffer.from([0, 0, 0xb1, 0x8f])

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32 (buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng (width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA

  // sRGB 与 pHYs 按规范是可选的，但只发 IHDR/IDAT/IEND 的最小结构在部分严格的
  // 图像管线（小程序开发者工具就是自己再编一遍图标）里属于“少见输入”，
  // 补上这两个分块让产物与常规工具链输出一致。
  const srgb = Buffer.from([0]) // 0 = Perceptual 渲染意图
  const phys = Buffer.alloc(9)
  phys.writeUInt32BE(2835, 0) // 72 DPI
  phys.writeUInt32BE(2835, 4)
  phys[8] = 1 // 单位：米

  const raw = Buffer.alloc(height * (1 + width * 4))
  let p = 0
  for (let y = 0; y < height; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      raw[p++] = rgba[i]
      raw[p++] = rgba[i + 1]
      raw[p++] = rgba[i + 2]
      raw[p++] = rgba[i + 3]
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('gAMA', gamma),
    chunk('sRGB', srgb),
    chunk('pHYs', phys),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- 绘图 ----------
function canvas () {
  return { data: Buffer.alloc(SIZE * SIZE * 4), width: SIZE, height: SIZE }
}

function setPixel (cv, x, y, rgb, alpha = 255) {
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return
  const i = (y * cv.width + x) * 4
  cv.data[i] = rgb[0]
  cv.data[i + 1] = rgb[1]
  cv.data[i + 2] = rgb[2]
  cv.data[i + 3] = alpha
}

function rect (cv, x0, y0, x1, y1, rgb) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setPixel(cv, x, y, rgb)
  }
}

function roundRect (cv, x0, y0, x1, y1, r, rgb) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const inCornerX = x < x0 + r ? x0 + r - x : x > x1 - r ? x - (x1 - r) : 0
      const inCornerY = y < y0 + r ? y0 + r - y : y > y1 - r ? y - (y1 - r) : 0
      if (inCornerX > 0 && inCornerY > 0 && Math.hypot(inCornerX, inCornerY) > r) continue
      setPixel(cv, x, y, rgb)
    }
  }
}

/** 等腰三角形：顶点 (cx, topY)，底边 y = bottomY，半宽 halfW */
function triangle (cv, cx, topY, bottomY, halfW, rgb) {
  for (let y = topY; y <= bottomY; y++) {
    const t = (y - topY) / (bottomY - topY)
    const hw = Math.round(halfW * t)
    for (let x = cx - hw; x <= cx + hw; x++) setPixel(cv, x, y, rgb)
  }
}

/** 屋顶 + 房体，中间挖一个门洞，读起来是「房子」而不是三角加方块 */
function drawHome (rgb) {
  const cv = canvas()
  triangle(cv, 40, 12, 40, 32, rgb)
  roundRect(cv, 16, 40, 64, 70, 6, rgb)
  // 挖门洞（透明）
  for (let y = 52; y <= 70; y++) {
    for (let x = 34; x <= 46; x++) setPixel(cv, x, y, [0, 0, 0], 0)
  }
  // 屋顶与房体之间的过渡补齐，避免只靠三角形尖顶显得头重脚轻
  rect(cv, 10, 38, 70, 42, rgb)
  return cv
}

/** 三根柱子的统计图 */
function drawChart (rgb) {
  const cv = canvas()
  roundRect(cv, 12, 44, 26, 70, 5, rgb)
  roundRect(cv, 33, 26, 47, 70, 5, rgb)
  roundRect(cv, 54, 12, 68, 70, 5, rgb)
  return cv
}
/**
 * 「我的」：圆头 + 肩身
 * 不用 Emoji，也不用真人照片位图 —— 保持与首页/统计两个图标同一套几何画法。
 */
function drawProfile (rgb) {
  const cv = canvas()
  const cx = 40
  // 头：实心圆（半径 13，圆心 y=26）
  for (let y = 13; y <= 39; y++) {
    for (let x = 27; x <= 53; x++) {
      if (Math.hypot(x - cx, y - 26) <= 13) setPixel(cv, x, y, rgb)
    }
  }
  // 肩身：以 (cx, 78) 为圆心的上半圆环，外半径 30 / 内半径 12，形成"人"的肩膀轮廓
  for (let y = 46; y <= 72; y++) {
    for (let x = 10; x <= 70; x++) {
      const d = Math.hypot(x - cx, y - 78)
      if (d <= 30 && d >= 12 && y <= 72) setPixel(cv, x, y, rgb)
    }
  }
  // 底部裁齐，避免半圆留一条圆弧边显得没落地
  for (let y = 73; y <= 78; y++) {
    for (let x = 10; x <= 70; x++) setPixel(cv, x, y, [0, 0, 0], 0)
  }
  return cv
}

const OUT_DIR = path.resolve(__dirname, '../src/assets/tabbar')
fs.mkdirSync(OUT_DIR, { recursive: true })

const icons = [
  ['home.png', drawHome(COLOR_INACTIVE)],
  ['home-active.png', drawHome(COLOR_ACTIVE)],
  ['chart.png', drawChart(COLOR_INACTIVE)],
  ['chart-active.png', drawChart(COLOR_ACTIVE)],
  ['profile.png', drawProfile(COLOR_INACTIVE)],
  ['profile-active.png', drawProfile(COLOR_ACTIVE)]
]

for (const [name, cv] of icons) {
  const buf = encodePng(cv.width, cv.height, cv.data)
  fs.writeFileSync(path.join(OUT_DIR, name), buf)
  console.log(`${name}: ${buf.length} bytes`)
}
