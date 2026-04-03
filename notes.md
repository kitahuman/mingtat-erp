# Field Options API

Categories:
- `machine_type` → 機種 (平斗, 勾斗, 夾斗, 拖頭, 車斗, 貨車, 輕型貨車, 私家車, 燈車, 挖掘機, 火轆)
- `tonnage` → 噸數 (3噸, 5.5噸, 8噸, 10噸, 11噸, 13噸, 14噸, 20噸, 24噸, 30噸, 33噸, 35噸, 38噸, 44噸, 49噸)
- `vehicle_type` → 車種 (泥頭車, 夾車, 勾斗車, 吊車, 拖架, 拖頭, 輕型貨車, 領航車)

API:
- `fieldOptionsApi.getByCategory('tonnage')` → returns array of {id, category, label, sort_order, is_active}
- `fieldOptionsApi.getByCategory('vehicle_type')` → returns array of {id, category, label, sort_order, is_active}

Frontend files that need updating (hardcoded TONNAGE_OPTIONS and VEHICLE_TYPE_OPTIONS):
1. rate-cards/page.tsx - list page
2. rate-cards/[id]/page.tsx - detail page
3. fleet-rate-cards/page.tsx - list page
4. fleet-rate-cards/[id]/page.tsx - detail page
5. subcon-rate-cards/page.tsx - list page
6. subcon-rate-cards/[id]/page.tsx - detail page
