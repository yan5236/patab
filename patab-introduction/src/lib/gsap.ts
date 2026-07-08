/**
 * GSAP 统一注册出口
 * 所有组件从这里 import gsap / ScrollTrigger / useGSAP，
 * 保证插件只注册一次，避免各处重复 registerPlugin。
 */
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, ScrollTrigger, useGSAP };
