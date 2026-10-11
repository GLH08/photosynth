# Build-I 进度（卡片按钮组 + 批量选择视觉反馈，断点续跑用）

格式：时间 | 内容 | 状态

## 计划
1. 【排查】确认 Build-H 组件引用的样式（card-manage / quick-feature / card-select-box / card-selected / batch-bar 等）在 globals.css 中**完全缺失**（组件有类名、无 CSS）。
2. 【CSS·1】重做卡片右上角按钮组：统一毛玻璃胶囊底（backdrop-filter + --r-md + --sh-1），桌面 hover/聚焦浮现，触控端常驻小尺寸；胶囊内按钮统一尺寸（30px 方钮、--r-md 派生圆角）。精选★：未精选半透明描边 ☆、精选态 --c-accent-500 琥珀金实心；删除确认态 --c-danger。
3. 【CSS·2】批量选择反馈：.card-select-box 左上角复选框（空心圆 → 钴蓝实心打勾）、.card-work.card-selected 钴蓝描边高亮（--c-primary-500）；选择模式下精选角标让位到左下，避免与复选框重叠。
4. 【CSS·3】补齐缺失的批量工具条样式（.batch-bar/.batch-count/.batch-panel），sticky 于 Header 下。
5. 【组件】QuickFeatureButton 紧凑态改用 card-pill-btn；WorkManageButtons 紧凑态改图标按钮（编辑=铅笔、删除=垃圾桶/确认=勾）；MasonryCard 复选框改 SVG 勾。
6. 【验证】npx tsc --noEmit、npm run build。

- 2026-10-11 | 计划落盘；基线：tsc --noEmit clean | ✅
- 2026-10-11 | 【CSS·1】重做卡片右上角按钮组：毛玻璃胶囊底（backdrop-filter + --r-md + --sh-1），胶囊内 30px 统一方钮；精选★未精选半透明描边、精选态琥珀金实心（--c-accent-500）；删除确认态危险红；桌面 hover/聚焦浮现，触控端常驻小尺寸 | ✅
- 2026-10-11 | 【CSS·2】批量选择视觉：左上角复选框（空心圆→钴蓝实心 SVG 打勾）、选中卡片钴蓝描边高亮（--c-primary-500）；选择模式下精选角标让位左下 | ✅
- 2026-10-11 | 【CSS·3】补齐批量工具条样式（.batch-bar sticky 于 Header 下、.batch-count、.batch-panel）| ✅
- 2026-10-11 | 【组件】QuickFeatureButton 紧凑态改 card-pill-btn；WorkManageButtons 紧凑态改 SVG 图标按钮（铅笔/垃圾桶/确认勾）；MasonryCard 复选框改 SVG | ✅
- 2026-10-11 | 【验证】tsc clean、npm run build 通过（11/11 页） | ✅
