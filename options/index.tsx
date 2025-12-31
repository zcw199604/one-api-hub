import "../popup/style.css"
import { useState, useEffect } from "react"
import {
  CogIcon,
  CpuChipIcon,
  KeyIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  MagnifyingGlassCircleIcon
} from "@heroicons/react/24/outline"
import { Toaster } from 'react-hot-toast'
import iconImage from "../assets/icon.png"

// 页面组件导入
import BasicSettings from "./pages/BasicSettings"
import ModelList from "./pages/ModelList"
import KeyManagement from "./pages/KeyManagement"
import ImportExport from "./pages/ImportExport"
import About from "./pages/About"
import QuotaCheck from "./pages/QuotaCheck"

// 菜单项类型定义
interface MenuItem {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  component: React.ComponentType<any>
}

// 菜单配置
const menuItems: MenuItem[] = [
  {
    id: 'basic',
    name: '基本设置',
    icon: CogIcon,
    component: BasicSettings
  },
  {
    id: 'models',
    name: '模型列表',
    icon: CpuChipIcon,
    component: ModelList
  },
  {
    id: 'keys',
    name: '密钥管理',
    icon: KeyIcon,
    component: KeyManagement
  },
  {
    id: 'quota-check',
    name: '额度检测',
    icon: MagnifyingGlassCircleIcon,
    component: QuotaCheck
  },
  {
    id: 'import-export',
    name: '导入/导出',
    icon: ArrowPathIcon,
    component: ImportExport
  },
  {
    id: 'about',
    name: '关于',
    icon: InformationCircleIcon,
    component: About
  }
]

// 解析URL hash和参数
function parseHash() {
  const hash = window.location.hash.slice(1) // 去掉 #
  if (!hash) return { page: 'basic', params: {} }
  
  const [page, ...paramParts] = hash.split('?')
  const params: Record<string, string> = {}
  
  if (paramParts.length > 0) {
    const paramString = paramParts.join('?')
    const urlParams = new URLSearchParams(paramString)
    for (const [key, value] of urlParams.entries()) {
      params[key] = value
    }
  }
  
  return { page: page || 'basic', params }
}

// 更新URL hash
function updateHash(page: string, params?: Record<string, string>) {
  let hash = `#${page}`
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params)
    hash += `?${searchParams.toString()}`
  }
  window.history.replaceState(null, '', hash)
}

function OptionsPage() {
  const [activeMenuItem, setActiveMenuItem] = useState('basic')
  const [routeParams, setRouteParams] = useState<Record<string, string>>({})

  // 初始化路由
  useEffect(() => {
    const { page, params } = parseHash()
    const validPage = menuItems.find(item => item.id === page) ? page : 'basic'
    setActiveMenuItem(validPage)
    setRouteParams(params)
    
    // 监听浏览器前进后退
    const handleHashChange = () => {
      const { page, params } = parseHash()
      const validPage = menuItems.find(item => item.id === page) ? page : 'basic'
      setActiveMenuItem(validPage)
      setRouteParams(params)
    }
    
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 切换菜单项
  const handleMenuItemChange = (itemId: string, params?: Record<string, string>) => {
    setActiveMenuItem(itemId)
    setRouteParams(params || {})
    updateHash(itemId, params)
  }

  // 获取当前活动的组件
  const ActiveComponent = menuItems.find(item => item.id === activeMenuItem)?.component || BasicSettings

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            {/* 插件图标和名称 */}
            <div className="flex items-center space-x-3">
              <img 
                src={iconImage} 
                alt="One API Hub" 
                className="w-8 h-8 rounded-lg shadow-sm"
              />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">One API Hub</h1>
                <p className="text-sm text-gray-500">AI 中转站账号管理插件</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* 左侧菜单导航栏 */}
          <aside className="w-64 flex-shrink-0">
            <nav className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">设置选项</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeMenuItem === item.id
                  
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleMenuItemChange(item.id)}
                        className={`w-full flex items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                          isActive 
                            ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600' 
                            : 'text-gray-700'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mr-3 ${
                          isActive ? 'text-blue-600' : 'text-gray-400'
                        }`} />
                        <span className="font-medium">{item.name}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </aside>

          {/* 右侧内容区域 */}
          <main className="flex-1 min-w-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-h-[600px]">
              <ActiveComponent routeParams={routeParams} />
            </div>
          </main>
        </div>
      </div>
      <Toaster
        position="bottom-center"
        reverseOrder={false}
        gutter={8}
        containerClassName=""
        containerStyle={{}}
        toastOptions={{
          className: '',
          duration: 4000,
          style: {
            background: '#fff',
            color: '#363636',
          },
          success: {
            duration: 3000,
          },
          error: {
            duration: 5000,
          },
        }}
      />
    </div>
  )
}

export default OptionsPage