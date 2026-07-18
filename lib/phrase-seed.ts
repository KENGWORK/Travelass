// Starter pack inserted as real, editable `phrases` rows via the "โหลดชุดคำ
// เริ่มต้น" button — not baked into the UI permanently, just a convenience
// seed so a trip doesn't start from a blank list. Mandarin only for now.
export const PHRASE_CATEGORIES = ["ทักทาย", "สั่งอาหาร", "เดินทาง", "ต่อรองราคา", "ช้อปปิ้ง", "ฉุกเฉิน", "อื่นๆ"] as const;

export const PHRASE_SEED: { category: string; text: string; pronunciation: string; meaning: string }[] = [
  { category: "ทักทาย", text: "你好", pronunciation: "nǐ hǎo", meaning: "สวัสดี" },
  { category: "ทักทาย", text: "谢谢", pronunciation: "xiè xie", meaning: "ขอบคุณ" },
  { category: "ทักทาย", text: "不客气", pronunciation: "bú kè qi", meaning: "ไม่เป็นไร / ยินดี" },
  { category: "ทักทาย", text: "对不起", pronunciation: "duì bu qǐ", meaning: "ขอโทษ" },
  { category: "ทักทาย", text: "再见", pronunciation: "zài jiàn", meaning: "ลาก่อน" },
  { category: "ทักทาย", text: "我不会说中文", pronunciation: "wǒ bú huì shuō zhōngwén", meaning: "ฉันพูดจีนไม่ได้" },
  { category: "ทักทาย", text: "你会说英语吗？", pronunciation: "nǐ huì shuō yīngyǔ ma?", meaning: "คุณพูดอังกฤษได้ไหม" },
  { category: "สั่งอาหาร", text: "菜单，谢谢", pronunciation: "càidān, xièxie", meaning: "ขอเมนูหน่อย" },
  { category: "สั่งอาหาร", text: "我要这个", pronunciation: "wǒ yào zhège", meaning: "เอาอันนี้" },
  { category: "สั่งอาหาร", text: "不要辣", pronunciation: "bú yào là", meaning: "ไม่เอาเผ็ด" },
  { category: "สั่งอาหาร", text: "买单", pronunciation: "mǎi dān", meaning: "เก็บเงินด้วย" },
  { category: "สั่งอาหาร", text: "好吃", pronunciation: "hǎo chī", meaning: "อร่อย" },
  { category: "สั่งอาหาร", text: "我对海鲜过敏", pronunciation: "wǒ duì hǎixiān guòmǐn", meaning: "ฉันแพ้อาหารทะเล" },
  { category: "เดินทาง", text: "这个多少钱？", pronunciation: "zhège duōshǎo qián?", meaning: "อันนี้ราคาเท่าไหร่" },
  { category: "เดินทาง", text: "去这里，谢谢", pronunciation: "qù zhèlǐ, xièxie", meaning: "ไปที่นี่ (ชี้แผนที่)" },
  { category: "เดินทาง", text: "地铁站在哪里？", pronunciation: "dìtiě zhàn zài nǎlǐ?", meaning: "สถานีรถไฟฟ้าอยู่ไหน" },
  { category: "เดินทาง", text: "请停在这里", pronunciation: "qǐng tíng zài zhèlǐ", meaning: "จอดตรงนี้ด้วย" },
  { category: "เดินทาง", text: "机场怎么走？", pronunciation: "jīchǎng zěnme zǒu?", meaning: "ไปสนามบินยังไง" },
  { category: "ต่อรองราคา", text: "太贵了", pronunciation: "tài guì le", meaning: "แพงไป" },
  { category: "ต่อรองราคา", text: "便宜一点吧", pronunciation: "piányi yìdiǎn ba", meaning: "ลดราคาหน่อยได้ไหม" },
  { category: "ต่อรองราคา", text: "可以刷卡吗？", pronunciation: "kěyǐ shuākǎ ma?", meaning: "รูดบัตรได้ไหม" },
  { category: "ช้อปปิ้ง", text: "有别的颜色吗？", pronunciation: "yǒu bié de yánsè ma?", meaning: "มีสีอื่นไหม" },
  { category: "ช้อปปิ้ง", text: "可以试穿吗？", pronunciation: "kěyǐ shìchuān ma?", meaning: "ลองใส่ได้ไหม" },
  { category: "ช้อปปิ้ง", text: "有点大/小", pronunciation: "yǒudiǎn dà / xiǎo", meaning: "มันใหญ่/เล็กไปหน่อย" },
  { category: "ฉุกเฉิน", text: "救命！", pronunciation: "jiùmìng!", meaning: "ช่วยด้วย" },
  { category: "ฉุกเฉิน", text: "请叫医生", pronunciation: "qǐng jiào yīshēng", meaning: "เรียกหมอให้หน่อย" },
  { category: "ฉุกเฉิน", text: "我需要帮助", pronunciation: "wǒ xūyào bāngzhù", meaning: "ฉันต้องการความช่วยเหลือ" },
  { category: "ฉุกเฉิน", text: "我的护照丢了", pronunciation: "wǒ de hùzhào diū le", meaning: "พาสปอร์ตฉันหาย" },
  { category: "อื่นๆ", text: "厕所在哪里？", pronunciation: "cèsuǒ zài nǎlǐ?", meaning: "ห้องน้ำอยู่ไหน" },
  { category: "อื่นๆ", text: "有WiFi吗？", pronunciation: "yǒu wifi ma?", meaning: "มีไวไฟไหม" },
];
