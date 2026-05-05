import { Language } from './translations';

const dynamicTranslations: Record<string, Record<Language, string>> = {
  // Service Type
  '運輸': { zh: '運輸', en: 'Transport' },
  '代工': { zh: '代工', en: 'Subcontracting' },
  '工程': { zh: '工程', en: 'Engineering' },
  '機械': { zh: '機械', en: 'Machinery' },
  '管工工作': { zh: '管工工作', en: 'Plumbing Work' },
  '維修保養': { zh: '維修保養', en: 'Maintenance' },
  '雜務': { zh: '雜務', en: 'Miscellaneous' },
  '上堂': { zh: '上堂', en: 'Training' },
  '緊急情況': { zh: '緊急情況', en: 'Emergency' },
  '請假/休息': { zh: '請假/休息', en: 'Leave/Rest' },

  // Tonnage
  '3噸': { zh: '3噸', en: '3T' },
  '5.5噸': { zh: '5.5噸', en: '5.5T' },
  '8噸': { zh: '8噸', en: '8T' },
  '10噸': { zh: '10噸', en: '10T' },
  '11噸': { zh: '11噸', en: '11T' },
  '13噸': { zh: '13噸', en: '13T' },
  '14噸': { zh: '14噸', en: '14T' },
  '20噸': { zh: '20噸', en: '20T' },
  '24噸': { zh: '24噸', en: '24T' },
  '30噸': { zh: '30噸', en: '30T' },
  '33噸': { zh: '33噸', en: '33T' },
  '35噸': { zh: '35噸', en: '35T' },
  '38噸': { zh: '38噸', en: '38T' },
  '44噸': { zh: '44噸', en: '44T' },
  '49噸': { zh: '49噸', en: '49T' },

  // Vehicle Type & Machine Type
  '平斗': { zh: '平斗', en: 'Flatbed' },
  '勾斗': { zh: '勾斗', en: 'Hook Bucket' },
  '夾斗': { zh: '夾斗', en: 'Grab Bucket' },
  '拖頭': { zh: '拖頭', en: 'Trailer Head' },
  '車斗': { zh: '車斗', en: 'Truck Bed' },
  '貨車': { zh: '貨車', en: 'Truck' },
  '輕型貨車': { zh: '輕型貨車', en: 'Light Goods Vehicle' },
  '私家車': { zh: '私家車', en: 'Private Car' },
  '燈車': { zh: '燈車', en: 'Lighting Vehicle' },
  '挖掘機': { zh: '挖掘機', en: 'Excavator' },
  '火轆': { zh: '火轆', en: 'Road Roller' },
  '泥頭車': { zh: '泥頭車', en: 'Dump Truck' },
  '夾車': { zh: '夾車', en: 'Clamp Truck' },
  '勾斗車': { zh: '勾斗車', en: 'Hooklift Truck' },
  '吊車': { zh: '吊車', en: 'Crane Truck' },
  '拖架': { zh: '拖架', en: 'Trailer' },
  '領航車': { zh: '領航車', en: 'Pilot Car' },
  '鉸接式自卸卡車': { zh: '鉸接式自卸卡車', en: 'Articulated Dump Truck' },
  '履帶式裝載機': { zh: '履帶式裝載機', en: 'Track Loader' },
};

export function getDynamicTranslation(text: string, lang: Language): string {
  if (lang === 'zh') {
    return text;
  }
  // Handle tonnage specifically: 'X噸' -> 'XT'
  if (text.endsWith('噸')) {
    return text.replace('噸', 'T');
  }
  return dynamicTranslations[text]?.[lang] || text;
}
