import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import pkg from '../package.json'
import devConfig from './dev'
import prodConfig from './prod'

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
// 本项目只面向微信小程序，h5 / rn 的构建配置与对应平台插件已移除
export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    // 项目名以 package.json 为单一来源，不再两处各写一份
    projectName: pkg.name,
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      '@tarojs/plugin-generator'
    ],
    defineConstants: {},
    copy: {
      patterns: [
        // tabBar 图标由 scripts/gen-tabbar-icons.js 生成到 src/assets，构建时原样拷到 dist
        { from: 'src/assets/', to: 'dist/assets/' }
      ],
      options: {}
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: true
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {}
        },
        cssModules: {
          // 全局样式靠 app.scss 里的变量与 fm-* 基础类复用，这里不启用 css modules
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        // 让 tsconfig 里的 @/* 别名在 webpack 侧同样生效
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆）
  return merge({}, baseConfig, prodConfig)
})
