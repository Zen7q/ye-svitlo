export const solarAssumptions=Object.freeze({panelWatts:550,annualYieldKwhPerKw:1100,evMonthlyKwh:300});
export function calculateSolar({monthlyKwh,hasElectricCar=false}={}){
 if(!Number.isFinite(monthlyKwh)||monthlyKwh<50||monthlyKwh>1500)throw Error('Оберіть споживання від 50 до 1500 кВт·год на місяць.');
 if(typeof hasElectricCar!=='boolean')throw Error('Оберіть, чи потрібно врахувати електромобіль.');
 const {panelWatts,annualYieldKwhPerKw,evMonthlyKwh}=solarAssumptions;
 const totalMonthlyKwh=monthlyKwh+(hasElectricCar?evMonthlyKwh:0);
 const annualConsumptionKwh=totalMonthlyKwh*12;
 const panelCount=Math.ceil(annualConsumptionKwh/(annualYieldKwhPerKw*panelWatts/1000));
 const systemKw=Number((panelCount*panelWatts/1000).toFixed(2));
 return {monthlyKwh,panelCount,panelWatts,systemKw,annualConsumptionKwh,annualYieldKwhPerKw,estimatedAnnualGenerationKwh:systemKw*annualYieldKwhPerKw,...(hasElectricCar?{hasElectricCar:true,evMonthlyKwh,totalMonthlyKwh}:{})};
}

// Demonstration component budget; not a quotation or a statistical market average.
// Panel and battery sanity checks on 2026-10-05:
// https://www.energomotive.com.ua/ua/solnechnye-paneli/product-2194900751-solnechnaja-panel-ja-solar-550
// https://www.powersol.com.ua/uk/product/se-g5-1-pro-b-deye-lifepo4-akumulyator-51-2v-100agod-5-12kvtgod/
// Inverter allowance approximates the demo catalogue's Deye retail prices.
export const systemPriceAssumptions=Object.freeze({panelUah:5000,inverterUahPerKw:9000,minInverterUah:30000,batteryUah:48000,batteryKwh:5.12,roundingUah:1000,asOf:'2026-10-05'});
export function estimateSystemPrice(systemKw,{includeBattery=false}={}){
 if(!Number.isFinite(systemKw)||systemKw<=0||systemKw>20||typeof includeBattery!=='boolean')throw Error('Неправильні параметри оцінки ціни.');
 const {panelUah,inverterUahPerKw,minInverterUah,batteryUah,batteryKwh,roundingUah,asOf}=systemPriceAssumptions;
 const panelCount=Math.ceil(systemKw*1000/solarAssumptions.panelWatts-1e-9);
 const panelsUah=panelCount*panelUah,inverterUah=Math.max(minInverterUah,systemKw*inverterUahPerKw);
 return {amountUah:Math.round((panelsUah+inverterUah+(includeBattery?batteryUah:0))/roundingUah)*roundingUah,panelsUah,inverterUah,batteryUah:includeBattery?batteryUah:0,batteryKwh:includeBattery?batteryKwh:0,includeBattery,asOf,includes:includeBattery?'Панелі, інвертор та акумулятор 5,12 кВт·год. Монтаж не враховано.':'Панелі та інвертор. Без акумулятора. Монтаж не враховано.'};
}
