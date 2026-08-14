import{c as t}from"./createLucideIcon-MINKtTIg.js";import{B as n,s as e}from"./index-BGLK2mSD.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=t("Bike",[["circle",{cx:"18.5",cy:"17.5",r:"3.5",key:"15x4ox"}],["circle",{cx:"5.5",cy:"17.5",r:"3.5",key:"1noe27"}],["circle",{cx:"15",cy:"5",r:"1",key:"19l28e"}],["path",{d:"M12 17.5V14l-3-3 4-3 2 3h2",key:"1npguv"}]]);/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=t("ChevronLeft",[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]]);async function f(s){if(!e)return{hasSession:!0,isPlatformAdmin:!0,email:"local@catalog.app"};const a=s!==void 0?{data:{session:s},error:null}:await e.auth.getSession();if(a.error)throw a.error;const r=a.data.session;if(!r)return{hasSession:!1,isPlatformAdmin:!1,email:null};const{data:i,error:o}=await e.rpc("is_platform_admin");return{hasSession:!0,isPlatformAdmin:!o&&!!i,email:r.user.email??null}}async function d(){n(),e&&await e.auth.signOut()}export{m as B,u as C,f as g,d as s};
