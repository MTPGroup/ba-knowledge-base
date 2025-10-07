#!/usr/bin/env node

/**
 * API 文档测试脚本
 * 验证 Scalar API Reference 和 OpenAPI 端点是否正常工作
 */

import http from 'http'
import https from 'https'

const BASE_URL = 'http://localhost:3001'
const TIMEOUT = 5000

// 测试端点列表
const endpoints = [
  {
    path: '/',
    name: '根端点',
    expectedStatus: 200,
  },
  {
    path: '/docs',
    name: 'Scalar API Reference 文档页面',
    expectedStatus: 200,
    expectedContent: 'scalar',
  },
  {
    path: '/openapi.json',
    name: 'OpenAPI JSON 规范',
    expectedStatus: 200,
    expectedContent: 'openapi',
  },
]

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`
}

// HTTP 请求函数
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    const req = client.get(url, { timeout: TIMEOUT }, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        })
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

// 测试单个端点
async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`

  try {
    console.log(`\n${colorize('测试:', 'cyan')} ${endpoint.name}`)
    console.log(`${colorize('URL:', 'blue')} ${url}`)

    const response = await makeRequest(url)

    // 检查状态码
    const statusMatch = response.statusCode === endpoint.expectedStatus
    console.log(
      `${colorize('状态码:', 'blue')} ${response.statusCode} ${
        statusMatch
          ? colorize('✓', 'green')
          : colorize(`✗ (期望: ${endpoint.expectedStatus})`, 'red')
      }`,
    )

    // 检查内容类型
    const contentType = response.headers['content-type'] || ''
    console.log(`${colorize('Content-Type:', 'blue')} ${contentType}`)

    // 检查期望内容
    let contentMatch = true
    if (endpoint.expectedContent) {
      contentMatch = response.body
        .toLowerCase()
        .includes(endpoint.expectedContent.toLowerCase())
      console.log(
        `${colorize('内容检查:', 'blue')} ${
          contentMatch
            ? colorize('✓', 'green')
            : colorize(`✗ (未找到 "${endpoint.expectedContent}")`, 'red')
        }`,
      )
    }

    // 额外的响应信息
    if (endpoint.path === '/openapi.json') {
      try {
        const jsonData = JSON.parse(response.body)
        console.log(
          `${colorize('OpenAPI 版本:', 'blue')} ${jsonData.openapi || 'N/A'}`,
        )
        console.log(
          `${colorize('API 标题:', 'blue')} ${jsonData.info?.title || 'N/A'}`,
        )
        console.log(
          `${colorize('API 版本:', 'blue')} ${jsonData.info?.version || 'N/A'}`,
        )
        console.log(
          `${colorize('路径数量:', 'blue')} ${Object.keys(jsonData.paths || {}).length}`,
        )
      } catch (e) {
        console.log(`${colorize('JSON 解析:', 'red')} 失败`)
      }
    }

    const success = statusMatch && contentMatch
    console.log(
      `${colorize('结果:', 'blue')} ${
        success ? colorize('通过', 'green') : colorize('失败', 'red')
      }`,
    )

    return success
  } catch (error) {
    console.log(`${colorize('错误:', 'red')} ${error.message}`)
    return false
  }
}

// 主测试函数
async function runTests() {
  console.log(colorize('🚀 开始 API 文档测试', 'bright'))
  console.log(colorize('='.repeat(50), 'cyan'))

  const results = []

  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint)
    results.push({ ...endpoint, success })
  }

  // 输出总结
  console.log(`\n${colorize('='.repeat(50), 'cyan')}`)
  console.log(colorize('📊 测试总结', 'bright'))

  const passed = results.filter((r) => r.success).length
  const total = results.length

  results.forEach((result) => {
    console.log(
      `${result.success ? colorize('✓', 'green') : colorize('✗', 'red')} ${result.name}`,
    )
  })

  console.log(`\n${colorize('通过:', 'green')} ${passed}/${total}`)

  if (passed === total) {
    console.log(colorize('🎉 所有测试通过！', 'green'))
    console.log(colorize('📖 您可以访问以下地址查看 API 文档:', 'cyan'))
    console.log(colorize(`   • Scalar API Reference: ${BASE_URL}/docs`, 'blue'))
    console.log(colorize(`   • OpenAPI JSON: ${BASE_URL}/openapi.json`, 'blue'))
  } else {
    console.log(colorize('❌ 部分测试失败！', 'red'))
    console.log(colorize('请检查服务器是否正在运行:', 'yellow'))
    console.log(colorize('   yarn dev', 'blue'))
  }

  process.exit(passed === total ? 0 : 1)
}

// 检查服务器是否运行
async function checkServerStatus() {
  try {
    await makeRequest(BASE_URL)
    return true
  } catch (error) {
    console.log(colorize('❌ 无法连接到服务器！', 'red'))
    console.log(colorize('请确保服务器正在运行:', 'yellow'))
    console.log(colorize('   yarn dev', 'blue'))
    return false
  }
}

// 启动测试
async function main() {
  console.log(colorize('🔍 检查服务器状态...', 'yellow'))

  const serverRunning = await checkServerStatus()
  if (!serverRunning) {
    process.exit(1)
  }

  console.log(colorize('✅ 服务器运行正常', 'green'))

  // 等待一秒钟让服务器完全启动
  await new Promise((resolve) => setTimeout(resolve, 1000))

  await runTests()
}

main().catch((error) => {
  console.error(colorize('测试脚本执行失败:', 'red'), error.message)
  process.exit(1)
})
