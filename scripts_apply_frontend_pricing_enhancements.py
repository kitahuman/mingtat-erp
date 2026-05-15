from pathlib import Path

path = Path('/home/ubuntu/mingtat-erp/frontend/src/app/(main)/invoices/[id]/pricing/page.tsx')
text = path.read_text()

# Add row price interface
old = """interface InvoiceItemDraft {
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount?: number;
  sort_order?: number;
  matched?: boolean;
  rate_card_id?: number | null;
}

interface PivotAxisItem {
"""
new = """interface InvoiceItemDraft {
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount?: number;
  sort_order?: number;
  matched?: boolean;
  rate_card_id?: number | null;
}

interface PivotRowPrice {
  unit_price: number;
  matched?: boolean;
  rate_card_id?: number | null;
  rate_card_name?: string | null;
  unit?: string | null;
  item_name?: string | null;
  description?: string | null;
}

interface PricingDraftPayload {
  pivot_config?: {
    rowFields?: PivotDimension[];
    colFields?: PivotDimension[];
    valueType?: PivotValueType;
    filters?: Record<string, unknown>;
  };
  row_prices?: Record<string, PivotRowPrice>;
  draft_items?: InvoiceItemDraft[];
}

interface PivotAxisItem {
"""
if new not in text:
    if old not in text:
        raise SystemExit('interface insertion point not found')
    text = text.replace(old, new, 1)

# Add helper functions after buildPricingGroups
marker = """function buildPricingGroups(workLogs: any[]): PricingGroup[] {
  const map = new Map<string, PricingGroup>();
  workLogs.forEach((workLog) => {
    const fields = workLogMatchFields(workLog);
    const key = recordKey([
      fields.company_id,
      fields.client_id,
      fields.client_contract_no,
      fields.service_type,
      fields.quotation_id,
      fields.day_night,
      fields.tonnage,
      fields.machine_type,
      fields.origin,
      fields.destination,
    ]);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.work_date && fields.work_date) existing.work_date = fields.work_date;
    } else {
      map.set(key, { key, ...fields, count: 1 });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key, 'zh-Hant'));
}

"""
insert = """function buildPricingGroups(workLogs: any[]): PricingGroup[] {
  const map = new Map<string, PricingGroup>();
  workLogs.forEach((workLog) => {
    const fields = workLogMatchFields(workLog);
    const key = recordKey([
      fields.company_id,
      fields.client_id,
      fields.client_contract_no,
      fields.service_type,
      fields.quotation_id,
      fields.day_night,
      fields.tonnage,
      fields.machine_type,
      fields.origin,
      fields.destination,
    ]);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.work_date && fields.work_date) existing.work_date = fields.work_date;
    } else {
      map.set(key, { key, ...fields, count: 1 });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key, 'zh-Hant'));
}

function uniqueNullable<T>(values: Array<T | null | undefined>): T | null {
  const normalized = values.filter((value): value is T => value !== null && value !== undefined && String(value).trim() !== '');
  const unique = Array.from(new Set(normalized.map((value) => String(value))));
  if (unique.length !== 1) return null;
  return normalized[0];
}

function rowMatchesWorkLog(row: RowEntry, workLog: any, rowFields: PivotDimension[]): boolean {
  const labels = rowFields.length > 0 ? rowFields.map((field) => dimensionValue(workLog, field)) : ['全部'];
  return labels.length === row.labels.length && row.labels.every((label, index) => labels[index] === label);
}

function buildPivotRowPricingGroup(row: RowEntry, workLogs: any[], rowFields: PivotDimension[], quantity: number): PricingGroup {
  const matchedLogs = workLogs.filter((workLog) => rowMatchesWorkLog(row, workLog, rowFields));
  const fields = matchedLogs.map(workLogMatchFields);
  return {
    key: row.key,
    company_id: uniqueNullable(fields.map((field) => field.company_id)),
    client_id: uniqueNullable(fields.map((field) => field.client_id)),
    client_contract_no: uniqueNullable(fields.map((field) => field.client_contract_no)),
    service_type: uniqueNullable(fields.map((field) => field.service_type)),
    quotation_id: uniqueNullable(fields.map((field) => field.quotation_id)),
    day_night: uniqueNullable(fields.map((field) => field.day_night)),
    tonnage: uniqueNullable(fields.map((field) => field.tonnage)),
    machine_type: uniqueNullable(fields.map((field) => field.machine_type)),
    origin: uniqueNullable(fields.map((field) => field.origin)),
    destination: uniqueNullable(fields.map((field) => field.destination)),
    work_date: uniqueNullable(fields.map((field) => field.work_date)),
    count: quantity || matchedLogs.length,
  };
}

function normalizeDraftItem(item: any, index: number): InvoiceItemDraft {
  return {
    item_name: item?.item_name || '',
    description: item?.description || '',
    quantity: Number(item?.quantity) || 0,
    unit: item?.unit || '',
    unit_price: Number(item?.unit_price) || 0,
    amount: Number(item?.amount) || 0,
    sort_order: item?.sort_order || index + 1,
    matched: typeof item?.matched === 'boolean' ? item.matched : undefined,
    rate_card_id: item?.rate_card_id || null,
  };
}

"""
if 'function buildPivotRowPricingGroup' not in text:
    if marker not in text:
        raise SystemExit('helper insertion marker not found')
    text = text.replace(marker, insert, 1)

# State additions
old = """  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
"""
new = """  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [rowPrices, setRowPrices] = useState<Record<string, PivotRowPrice>>({});
  const [leftPanelHidden, setLeftPanelHidden] = useState(false);
  const [rightPanelHidden, setRightPanelHidden] = useState(false);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
"""
if new not in text:
    if old not in text:
        raise SystemExit('state insertion point not found')
    text = text.replace(old, new, 1)

# Replace loadData Promise and draft hydration block
old = """      const [pricingRes, unitsRes] = await Promise.all([
        invoicesApi.getPricingData(invoiceId),
        fieldOptionsApi.getByCategory('wage_unit').catch(() => ({ data: [] })),
      ]);
      const loadedWorkLogs = pricingRes.data.work_logs || [];
      setInvoice(pricingRes.data.invoice);
      setWorkLogs(loadedWorkLogs);
      setItems((pricingRes.data.items || []).map((item: any, idx: number) => ({
        item_name: item.item_name || '',
        description: item.description || '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || '',
        unit_price: Number(item.unit_price) || 0,
        amount: Number(item.amount) || 0,
        sort_order: item.sort_order || idx + 1,
      })));
      setUnitOptions((unitsRes.data || []).map((option: any) => ({ value: option.label || option.value || '', label: option.label || option.value || '' })).filter((option: Option) => option.value));
      setCollapsedRows(new Set());
      setCollapsedCols(new Set());
"""
new = """      const [pricingRes, draftRes, unitsRes] = await Promise.all([
        invoicesApi.getPricingData(invoiceId),
        invoicesApi.getPricingDraft(invoiceId).catch(() => ({ data: { draft: null } })),
        fieldOptionsApi.getByCategory('wage_unit').catch(() => ({ data: [] })),
      ]);
      const loadedWorkLogs = pricingRes.data.work_logs || [];
      const pricingDraft = draftRes.data?.draft as PricingDraftPayload | null;
      const pivotConfig = pricingDraft?.pivot_config || {};
      const filters = pivotConfig.filters || {};
      setInvoice(pricingRes.data.invoice);
      setWorkLogs(loadedWorkLogs);
      setItems(Array.isArray(pricingDraft?.draft_items) && pricingDraft.draft_items.length > 0
        ? pricingDraft.draft_items.map(normalizeDraftItem)
        : (pricingRes.data.items || []).map(normalizeDraftItem));
      setUnitOptions((unitsRes.data || []).map((option: any) => ({ value: option.label || option.value || '', label: option.label || option.value || '' })).filter((option: Option) => option.value));
      setRowPrices(pricingDraft?.row_prices || {});
      if (Array.isArray(pivotConfig.rowFields)) setRowFields(pivotConfig.rowFields.filter((field) => DIMENSION_OPTIONS.some((option) => option.value === field)));
      if (Array.isArray(pivotConfig.colFields)) setColFields(pivotConfig.colFields.filter((field) => DIMENSION_OPTIONS.some((option) => option.value === field)));
      if (pivotConfig.valueType && VALUE_OPTIONS.some((option) => option.value === pivotConfig.valueType)) setValueType(pivotConfig.valueType);
      setDateFrom(typeof filters.dateFrom === 'string' ? filters.dateFrom : '');
      setDateTo(typeof filters.dateTo === 'string' ? filters.dateTo : '');
      setCompanyIds(Array.isArray(filters.companyIds) ? filters.companyIds.map(String) : []);
      setClientIds(Array.isArray(filters.clientIds) ? filters.clientIds.map(String) : []);
      setEmployeeIds(Array.isArray(filters.employeeIds) ? filters.employeeIds.map(String) : []);
      setEquipmentNumbers(Array.isArray(filters.equipmentNumbers) ? filters.equipmentNumbers.map(String) : []);
      setSelectedMachineTypes(Array.isArray(filters.selectedMachineTypes) ? filters.selectedMachineTypes.map(String) : []);
      setStartLocations(Array.isArray(filters.startLocations) ? filters.startLocations.map(String) : []);
      setEndLocations(Array.isArray(filters.endLocations) ? filters.endLocations.map(String) : []);
      setSelectedContracts(Array.isArray(filters.selectedContracts) ? filters.selectedContracts.map(String) : []);
      setSelectedQuotations(Array.isArray(filters.selectedQuotations) ? filters.selectedQuotations.map(String) : []);
      setSelectedDayNights(Array.isArray(filters.selectedDayNights) ? filters.selectedDayNights.map(String) : []);
      setSelectedServiceTypes(Array.isArray(filters.selectedServiceTypes) ? filters.selectedServiceTypes.map(String) : []);
      setSelectedStatuses(Array.isArray(filters.selectedStatuses) ? filters.selectedStatuses.map(String) : []);
      setCollapsedRows(new Set());
      setCollapsedCols(new Set());
"""
if old not in text:
    raise SystemExit('loadData block not found')
text = text.replace(old, new, 1)

# Export CSV headers and rows include unit price and amount
text = text.replace(
    "const headers = [rowAxisHeader, ...visibleCols.map((col) => col.labels.join(' / ')), '合計'];",
    "const headers = [rowAxisHeader, ...visibleCols.map((col) => col.labels.join(' / ')), '合計', '單價', '金額'];",
    1,
)
text = text.replace(
    """        row.isGroup ? '' : metricText(aggregateMetric(pivot, row.labels, [])),
      ]);
""",
    """        row.isGroup ? '' : metricText(aggregateMetric(pivot, row.labels, [])),
        row.isGroup ? '' : String(rowPrices[row.key]?.unit_price || 0),
        row.isGroup ? '' : String(Math.round((aggregateMetric(pivot, row.labels, []).value || 0) * (Number(rowPrices[row.key]?.unit_price) || 0) * 100) / 100),
      ]);
""",
    1,
)
text = text.replace(
    "lines.push(['合計', ...visibleCols.map((col) => metricText(aggregateMetric(pivot, [], col.labels))), metricText(pivot.grandTotal)]);",
    "lines.push(['合計', ...visibleCols.map((col) => metricText(aggregateMetric(pivot, [], col.labels))), metricText(pivot.grandTotal), '', '']);",
    1,
)

# Replace handleMatchRates block
old = """  const handleMatchRates = async () => {
    if (pricingGroups.length === 0) {
      alert('沒有可配對的工作紀錄分組');
      return;
    }
    setMatching(true);
    try {
      const res = await invoicesApi.matchRates(invoiceId, { groups: pricingGroups });
      const results = res.data.results || [];
      setMatchResults(results);
      setItems(results.map((result: any, idx: number) => ({
        item_name: result.item_name || '發票項目',
        description: result.matched ? groupDescription(result) : `未配對價目表；${groupDescription(result)}`,
        quantity: Number(result.quantity ?? result.count) || 0,
        unit: result.unit || 'JOB',
        unit_price: Number(result.unit_price) || 0,
        sort_order: idx + 1,
        matched: Boolean(result.matched),
        rate_card_id: result.rate_card_id || null,
      })));
    } catch (err: any) {
      alert(err.response?.data?.message || '配對價目表失敗');
    } finally {
      setMatching(false);
    }
  };
"""
new = """  const updateRowUnitPrice = (rowKey: string, unitPrice: number) => {
    setRowPrices((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || {}),
        unit_price: unitPrice,
        matched: unitPrice > 0 ? current[rowKey]?.matched : current[rowKey]?.matched,
      },
    }));
  };

  const addPivotRowToItems = (row: RowEntry) => {
    if (readOnly || row.isGroup) return;
    const metric = aggregateMetric(pivot, row.labels, []);
    const rowPrice = rowPrices[row.key] || { unit_price: 0 };
    const unitPrice = Number(rowPrice.unit_price) || 0;
    setItems((current) => [...current, {
      item_name: rowPrice.item_name || row.label || 'Pivot 項目',
      description: rowPrice.description || row.label,
      quantity: Number(metric.value) || 0,
      unit: rowPrice.unit || metric.unit || 'JOB',
      unit_price: unitPrice,
      amount: Math.round((Number(metric.value) || 0) * unitPrice * 100) / 100,
      sort_order: current.length + 1,
      matched: rowPrice.matched,
      rate_card_id: rowPrice.rate_card_id || null,
    }]);
  };

  const handleMatchRates = async () => {
    const matchableRows = visibleRows.filter((row) => !row.isGroup);
    if (matchableRows.length === 0) {
      alert('沒有可配對的 Pivot 行');
      return;
    }
    setMatching(true);
    try {
      const groups = matchableRows.map((row) => {
        const metric = aggregateMetric(pivot, row.labels, []);
        return buildPivotRowPricingGroup(row, filteredWorkLogs, rowFields, metric.value);
      });
      const res = await invoicesApi.matchRates(invoiceId, { groups });
      const results = res.data.results || [];
      setMatchResults(results);
      setRowPrices((current) => {
        const next = { ...current };
        results.forEach((result: any, index: number) => {
          const row = matchableRows[index];
          const rowKey = result.key || row?.key;
          if (!rowKey) return;
          next[rowKey] = {
            ...(next[rowKey] || {}),
            unit_price: Number(result.unit_price) || 0,
            matched: Boolean(result.matched),
            rate_card_id: result.rate_card_id || null,
            rate_card_name: result.rate_card_name || null,
            unit: result.unit || null,
            item_name: result.item_name || null,
            description: result.matched ? groupDescription(result) : `未配對價目表；${groupDescription(result)}`,
          };
        });
        return next;
      });
    } catch (err: any) {
      alert(err.response?.data?.message || '配對價目表失敗');
    } finally {
      setMatching(false);
    }
  };
"""
if old not in text:
    raise SystemExit('handleMatchRates block not found')
text = text.replace(old, new, 1)

# Add handleSavePricingDraft before handleSaveItems
marker = """  const handleSaveItems = async () => {
"""
insert = """  const handleSavePricingDraft = async () => {
    if (readOnly) return;
    setSavingDraft(true);
    try {
      await invoicesApi.savePricingDraft(invoiceId, {
        pivot_config: {
          rowFields,
          colFields,
          valueType,
          filters: {
            dateFrom,
            dateTo,
            companyIds,
            clientIds,
            employeeIds,
            equipmentNumbers,
            selectedMachineTypes,
            startLocations,
            endLocations,
            selectedContracts,
            selectedQuotations,
            selectedDayNights,
            selectedServiceTypes,
            selectedStatuses,
          },
        },
        row_prices: rowPrices,
        draft_items: items.map((item, idx) => ({
          ...item,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          amount: rowAmount(item),
          sort_order: idx + 1,
        })),
      });
      alert('Step B 草稿已儲存');
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存 Step B 草稿失敗');
    } finally {
      setSavingDraft(false);
    }
  };

"""
if insert not in text:
    if marker not in text:
        raise SystemExit('save draft insertion marker not found')
    text = text.replace(marker, insert + marker, 1)

# Header buttons: add save draft
old = """        <div className="flex gap-2">
          <Link href={`/invoices/${invoiceId}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">返回發票</Link>
          <button onClick={loadData} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">重新整理</button>
        </div>
"""
new = """        <div className="flex flex-wrap gap-2">
          <Link href={`/invoices/${invoiceId}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">返回發票</Link>
          <button onClick={loadData} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">重新整理</button>
          <button onClick={handleSavePricingDraft} disabled={savingDraft || readOnly} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300">
            {savingDraft ? '儲存中...' : '儲存 Step B'}
          </button>
        </div>
"""
if old not in text:
    raise SystemExit('top button block not found')
text = text.replace(old, new, 1)

# Grid class and conditional panels
text = text.replace(
    "<div className=\"grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.85fr)]\">",
    "<div className={`grid grid-cols-1 gap-5 ${leftPanelHidden || rightPanelHidden ? 'xl:grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.85fr)]'}`}>\n        {leftPanelHidden ? (\n          <button onClick={() => setLeftPanelHidden(false)} className=\"rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-100\">展開左側 Pivot Table</button>\n        ) : (",
    1,
)
text = text.replace(
    """        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
""",
    """        </section>
        )}

        {rightPanelHidden ? (
          <button onClick={() => setRightPanelHidden(false)} className="rounded-xl border border-dashed border-green-300 bg-green-50 px-4 py-3 text-left text-sm font-semibold text-green-700 hover:bg-green-100">展開右側 Invoice Items</button>
        ) : (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
""",
    1,
)
text = text.replace(
    """        </section>
      </div>
""",
    """        </section>
        )}
      </div>
""",
    1,
)

# Add hide buttons to panel headers
text = text.replace(
    """                <h2 className="text-lg font-semibold text-gray-900">Pivot Table</h2>
                <p className="text-sm text-gray-500">已載入 {workLogs.length} 筆工作紀錄，篩選後 {filteredWorkLogs.length} 筆；所有篩選、分組和值計算均在前端完成。</p>
              </div>
              <div className="flex flex-wrap gap-2">
""",
    """                <h2 className="text-lg font-semibold text-gray-900">Pivot Table</h2>
                <p className="text-sm text-gray-500">已載入 {workLogs.length} 筆工作紀錄，篩選後 {filteredWorkLogs.length} 筆；所有篩選、分組和值計算均在前端完成。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setLeftPanelHidden(true)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">隱藏左側</button>
""",
    1,
)
text = text.replace(
    """                <h2 className="text-lg font-semibold text-gray-900">Invoice Items 編輯器</h2>
                <p className="text-sm text-gray-500">配對只會更新右側草稿；按「確認生成」才會寫入 InvoiceItems。</p>
              </div>
              <div className="flex gap-2">
""",
    """                <h2 className="text-lg font-semibold text-gray-900">Invoice Items 編輯器</h2>
                <p className="text-sm text-gray-500">「配對價目表」會填入左側 Pivot 單價；按每行「加到右邊」建立草稿，按「確認生成」才會寫入 InvoiceItems。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setRightPanelHidden(true)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">隱藏右側</button>
""",
    1,
)

# Table header add columns and body colSpan
text = text.replace(
    "{depthIndex === 0 && <th rowSpan={Math.max(colFields.length, 1)} className=\"sticky right-0 z-30 min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700\">合計</th>}",
    "{depthIndex === 0 && <>\n                          <th rowSpan={Math.max(colFields.length, 1)} className=\"min-w-[120px] border-b border-l border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700\">合計</th>\n                          <th rowSpan={Math.max(colFields.length, 1)} className=\"min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700\">單價</th>\n                          <th rowSpan={Math.max(colFields.length, 1)} className=\"min-w-[120px] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700\">金額</th>\n                          <th rowSpan={Math.max(colFields.length, 1)} className=\"min-w-[110px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700\">操作</th>\n                        </>}",
    1,
)
text = text.replace(
    "colSpan={visibleCols.length + 2}",
    "colSpan={visibleCols.length + 5}",
    1,
)
old = """                        <td className="sticky right-0 z-10 border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                          {row.isGroup ? '' : metricText(aggregateMetric(pivot, row.labels, []))}
                        </td>
"""
new = """                        {(() => {
                          const totalMetric = row.isGroup ? EMPTY_METRIC : aggregateMetric(pivot, row.labels, []);
                          const rowPrice = rowPrices[row.key];
                          const unitPrice = Number(rowPrice?.unit_price) || 0;
                          const amount = Math.round((Number(totalMetric.value) || 0) * unitPrice * 100) / 100;
                          const priceStatusClass = rowPrice?.matched === false
                            ? 'bg-yellow-50 text-yellow-900'
                            : rowPrice?.matched === true
                              ? 'bg-green-50 text-green-900'
                              : 'bg-white text-gray-900';
                          return (
                            <>
                              <td className="border-b border-l border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                {row.isGroup ? '' : metricText(totalMetric)}
                              </td>
                              <td className={`border-b border-r border-gray-200 px-2 py-2 ${row.isGroup ? 'bg-gray-50' : priceStatusClass}`}>
                                {!row.isGroup && (
                                  <input
                                    type="number"
                                    value={rowPrice?.unit_price ?? ''}
                                    onChange={(event) => updateRowUnitPrice(row.key, Number(event.target.value))}
                                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-right text-sm tabular-nums"
                                    placeholder="0.00"
                                    disabled={readOnly}
                                  />
                                )}
                              </td>
                              <td className="border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                {row.isGroup ? '' : fmtMoney(amount)}
                              </td>
                              <td className="border-b border-gray-200 bg-white px-2 py-2 text-center">
                                {!row.isGroup && (
                                  <button onClick={() => addPivotRowToItems(row)} disabled={readOnly} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                                    加到右邊
                                  </button>
                                )}
                              </td>
                            </>
                          );
                        })()}
"""
if old not in text:
    raise SystemExit('pivot total cell block not found')
text = text.replace(old, new, 1)
text = text.replace(
    "<td className=\"sticky right-0 z-30 border-t border-l border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums text-gray-900\">{metricText(pivot.grandTotal)}</td>",
    "<td className=\"border-t border-l border-gray-300 bg-gray-100 px-3 py-2 text-right font-bold tabular-nums text-gray-900\">{metricText(pivot.grandTotal)}</td>\n                      <td className=\"border-t border-r border-gray-300 bg-gray-100 px-3 py-2\"></td>\n                      <td className=\"border-t border-r border-gray-300 bg-gray-100 px-3 py-2\"></td>\n                      <td className=\"border-t border-gray-300 bg-gray-100 px-3 py-2\"></td>",
    1,
)

# Match button disabled condition and summary copy
text = text.replace(
    "<button onClick={handleMatchRates} disabled={matching || workLogs.length === 0}",
    "<button onClick={handleMatchRates} disabled={matching || filteredWorkLogs.length === 0}",
    1,
)
text = text.replace(
    "已完成配對：成功 {matchResults.length - unmatchedCount} 組，未配對 {unmatchedCount} 組。未配對項目會以 $0 單價保留，請人工修正後再確認生成。",
    "已完成配對：成功 {matchResults.length - unmatchedCount} 行，未配對 {unmatchedCount} 行。未配對的 Pivot 行會以黃色標示，請人工輸入單價後再加到右邊。",
    1,
)

path.write_text(text)
print('frontend pricing enhancements patch applied')
