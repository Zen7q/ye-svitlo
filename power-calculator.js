export const solarAssumptions={panelWatts:550,annualYieldKwhPerKw:1100};
export function calculateSolar({monthlyKwh}={}){
 if(!Number.isFinite(monthlyKwh)||monthlyKwh<50||monthlyKwh>1500)throw Error('Оберіть споживання від 50 до 1500 кВт·год на місяць.');
 const {panelWatts,annualYieldKwhPerKw}=solarAssumptions;
 const annualConsumptionKwh=monthlyKwh*12;
 const panelCount=Math.ceil(annualConsumptionKwh/(annualYieldKwhPerKw*panelWatts/1000));
 const systemKw=Number((panelCount*panelWatts/1000).toFixed(2));
 return {monthlyKwh,panelCount,panelWatts,systemKw,annualConsumptionKwh,annualYieldKwhPerKw,estimatedAnnualGenerationKwh:systemKw*annualYieldKwhPerKw};
}
