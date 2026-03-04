export interface Quote {
  text: string;
  page: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  year: string;
  pages: string;
  rating: string;
  desc: string;
  coverBg: string;
  coverTitle: string;
  coverAuthor: string;
  quotes: Quote[];
}

export const books: Book[] = [
  {
    id: "hundred-years-of-solitude",
    title: "百年孤独",
    author: "加西亚·马尔克斯",
    category: "魔幻现实主义",
    year: "1967",
    pages: "360",
    rating: "9.3",
    desc: "《百年孤独》是魔幻现实主义文学的代表作，描写了布恩迪亚家族七代人的传奇故事，以及加勒比海沿岸小镇马孔多的百年兴衰，反映了拉丁美洲一个世纪以来风云变幻的历史。",
    coverBg: "linear-gradient(145deg, #1a5c2a, #2d8a4e, #1a5c2a)",
    coverTitle: "百年孤独",
    coverAuthor: "马尔克斯",
    quotes: [
      { text: "过去都是假的，回忆是一条没有归途的路，以往的一切春天都无法复原，即使最狂热最坚贞的爱情，归根结底也不过是一种瞬息即逝的现实。", page: "第二十章" },
      { text: "生命中曾经有过的所有灿烂，原来终究都需要用寂寞来偿还。", page: "第十五章" },
      { text: "我们趋行在人生这个亘古的旅途，在坎坷中奔跑，在挫折里涅槃，忧愁缠满全身，痛苦飘洒一地。", page: "第八章" },
      { text: "无论走到哪里，都应该记住，过去都是假的，回忆是一条没有尽头的路。", page: "第十二章" },
      { text: "他渐渐明白，安度晚年的秘诀不是别的，而是跟孤独签订体面的协议。", page: "第十九章" },
    ],
  },
  {
    id: "the-little-prince",
    title: "小王子",
    author: "安托万·德·圣-埃克苏佩里",
    category: "童话寓言",
    year: "1943",
    pages: "97",
    rating: "9.0",
    desc: "小王子从自己的星球出发，先后访问了六个星球，最后来到地球。在沙漠中与飞行员相遇，讲述了自己的故事。这是一部写给大人的童话，关于爱、责任与生命的寓言。",
    coverBg: "linear-gradient(145deg, #1a3a8a, #2952c8, #1a3a8a)",
    coverTitle: "小王子",
    coverAuthor: "圣-埃克苏佩里",
    quotes: [
      { text: "所有的大人都曾经是小孩，虽然，只有少数的人记得。", page: "献辞" },
      { text: "真正重要的东西，用眼睛是看不见的，只有用心才能看得清。", page: "第二十一章" },
      { text: "如果你爱上了某个星球的一朵花，那么只要在夜晚仰望星空，就会觉得漫天的繁星就像一朵朵盛开的花。", page: "第二十六章" },
      { text: "你在你的玫瑰花身上耗费的时间，使得你的玫瑰花变得如此重要。", page: "第二十一章" },
      { text: "使沙漠显得美丽的，是它在某处藏着一眼泉水。", page: "第二十四章" },
    ],
  },
  {
    id: "sapiens",
    title: "人类简史",
    author: "尤瓦尔·赫拉利",
    category: "历史人文",
    year: "2014",
    pages: "440",
    rating: "9.1",
    desc: "从十万年前有生命迹象开始到21世纪资本、科技交织的人类发展史，将科学和历史编织在一起，从全新的角度阐述地球上智人的发展历史。",
    coverBg: "linear-gradient(145deg, #b52020, #d43d3d, #b52020)",
    coverTitle: "人类简史",
    coverAuthor: "赫拉利",
    quotes: [
      { text: "人类之所以能征服世界，是因为有独特的能力——创造并相信虚构的故事。", page: "第二章" },
      { text: "金钱是有史以来最成功的故事。不是所有人都信上帝，不是所有人都信人权，但所有人都信钱。", page: "第十章" },
      { text: "历史的铁则就是：事后看来无可避免的事，在当时看来总是毫不明显。", page: "第十四章" },
      { text: "我们的语言发展成了一种八卦的工具。根据这一理论，智人主要是一种社会性的动物。", page: "第二章" },
      { text: "快乐并不在于任何客观条件，而在于客观条件和主观期望之间是否相符。", page: "第十九章" },
    ],
  },
  {
    id: "the-moon-and-sixpence",
    title: "月亮与六便士",
    author: "威廉·萨默塞特·毛姆",
    category: "经典文学",
    year: "1919",
    pages: "280",
    rating: "9.0",
    desc: "一个英国证券交易所的经纪人，本已有牢靠的职业和地位、美满的家庭，但却迷恋上绘画，像被魔鬼附了体，突然弃家出走，到巴黎去追求绘画的理想。",
    coverBg: "linear-gradient(145deg, #1a1a40, #2a2a60, #1a1a40)",
    coverTitle: "月亮与六便士",
    coverAuthor: "毛姆",
    quotes: [
      { text: "满地都是六便士，他却抬头看见了月亮。", page: "题记" },
      { text: "我用尽了全力，过着平凡的一生。", page: "第五十章" },
      { text: "做自己最想做的事，生活在自己喜爱的环境里，淡泊宁静、与世无争，这难道是糟蹋自己吗？", page: "第十九章" },
      { text: "有时候，人们把面具佩戴得天衣无缝，连他们自己都以为在佩戴面具的过程中自己实际上就成了和面具一样的人了。", page: "第七章" },
      { text: "世界是冷酷无情的，残忍的。我们生到人世间没有人知道为了什么，我们死后没有人知道到何处去。", page: "第三十章" },
    ],
  },
  {
    id: "to-live",
    title: "活着",
    author: "余华",
    category: "当代文学",
    year: "1993",
    pages: "191",
    rating: "9.4",
    desc: "讲述了农村人福贵悲惨的人生遭遇。福贵本是个阔少爷，可他嗜赌如命，终于赌光了家业。他的亲人一个个离他而去，最后只剩一头老牛与他相依为命。",
    coverBg: "linear-gradient(145deg, #5a3a20, #8a5a30, #5a3a20)",
    coverTitle: "活着",
    coverAuthor: "余华",
    quotes: [
      { text: "人是为活着本身而活着的，而不是为了活着之外的任何事物所活着。", page: "自序" },
      { text: "没有什么比时间更具有说服力了，因为时间无需通知我们就可以改变一切。", page: "第三章" },
      { text: "最初我们来到这个世界，是因为不得不来；最终我们离开这个世界，是因为不得不走。", page: "第九章" },
      { text: "以笑的方式哭，在死亡的伴随下活着。", page: "第六章" },
      { text: "人只要活得高兴，穷也不怕。", page: "第二章" },
    ],
  },
  {
    id: "sophies-world",
    title: "苏菲的世界",
    author: "乔斯坦·贾德",
    category: "哲学启蒙",
    year: "1991",
    pages: "535",
    rating: "8.8",
    desc: "14岁的少女苏菲某天放学回家，收到了神秘的一封信。就这样，在一位神秘导师的指引下，苏菲开始思索从古希腊到康德的哲学问题。",
    coverBg: "linear-gradient(145deg, #5a1a8a, #7a2ab0, #5a1a8a)",
    coverTitle: "苏菲的世界",
    coverAuthor: "贾德",
    quotes: [
      { text: "你是谁？世界从何而来？如果你不曾思考过这些问题，那你活着又有什么意义？", page: "第一章" },
      { text: "生命本来就是悲伤而严肃的。我们来到这个美好的世界里，彼此相逢，彼此问候，并结伴同游一段短暂的时间。", page: "第十五章" },
      { text: "这个世界不可能大家都喜欢我，我也不需要每个人都喜欢我，我只能说很多人还不了解我。", page: "第八章" },
      { text: "真正的知识来自内心，而不是得自别人的传授。", page: "第三章" },
      { text: "没有人天生该对谁好，所以我们要学会感恩，学会珍惜。", page: "第二十章" },
    ],
  },
  {
    id: "the-kite-runner",
    title: "追风筝的人",
    author: "卡勒德·胡赛尼",
    category: "当代小说",
    year: "2003",
    pages: "362",
    rating: "8.9",
    desc: "12岁的阿富汗富家少爷阿米尔与仆人哈桑情同手足。然而，在一场风筝比赛后，发生了一件悲惨不堪的事，阿米尔为自己的懦弱感到自责和痛苦，逼走了哈桑。",
    coverBg: "linear-gradient(145deg, #c45a10, #e87a20, #c45a10)",
    coverTitle: "追风筝的人",
    coverAuthor: "胡赛尼",
    quotes: [
      { text: "为你，千千万万遍。", page: "第七章" },
      { text: "得到了再失去，总是比从来就没有得到更伤人。", page: "第十四章" },
      { text: "被真相伤害总比被谎言欺骗的好，得到了再失去，总是比从来就没有得到更伤人。", page: "第十七章" },
      { text: "许多年过去了，人们说陈年旧事可以被埋葬，然而我终于明白这是错的，因为往事会自行爬上来。", page: "第一章" },
      { text: "当罪行导致善行，那就是真正的获救。", page: "第二十二章" },
    ],
  },
  {
    id: "walden",
    title: "瓦尔登湖",
    author: "亨利·戴维·梭罗",
    category: "散文随笔",
    year: "1854",
    pages: "312",
    rating: "8.6",
    desc: "梭罗独自在瓦尔登湖畔生活了两年两个月，记录了他在自然中的所见所思。这本书是对简朴生活的颂歌，也是对现代文明的深刻反思。",
    coverBg: "linear-gradient(145deg, #1a4a3a, #2a7a5a, #1a4a3a)",
    coverTitle: "瓦尔登湖",
    coverAuthor: "梭罗",
    quotes: [
      { text: "我步入丛林，因为我希望生活得有意义。我希望活得深刻，吸取生命中所有的精华。", page: "第二章" },
      { text: "大多数人都生活在平静的绝望中。", page: "第一章" },
      { text: "一个人越是有许多事情能够放得下，他越是富有。", page: "第二章" },
      { text: "不必给我爱，不必给我钱，不必给我名誉，给我真理吧。", page: "第十八章" },
      { text: "时间只是我垂钓的溪流。我饮着它的水，喝水的时候我看到了沙底，发现它是多么浅。", page: "第二章" },
    ],
  },
  {
    id: "the-stranger",
    title: "局外人",
    author: "阿尔贝·加缪",
    category: "存在主义",
    year: "1942",
    pages: "120",
    rating: "9.0",
    desc: "默尔索是阿尔及尔的一个小职员，母亲去世后他没有哭泣，之后在海滩上莫名其妙地杀了一个阿拉伯人。法庭审判时，他因为对母亲之死的冷漠态度而被判处死刑。",
    coverBg: "linear-gradient(145deg, #2a2a2a, #4a4a4a, #2a2a2a)",
    coverTitle: "局外人",
    coverAuthor: "加缪",
    quotes: [
      { text: "我知道这世界我无处容身，只是，你凭什么审判我的灵魂？", page: "第二部" },
      { text: "人生在世，永远也不该演戏作假。", page: "第一部" },
      { text: "我们很少信任比我们好的人，宁肯避免与他们来往。相反，我们常对与我们相似、和我们有着共同弱点的人吐露心迹。", page: "第一部" },
      { text: "一个人只要学会了回忆，就再不会孤独，哪怕只在世上生活一日，你也能毫无困难地凭回忆在囚牢中独处百年。", page: "第二部" },
      { text: "在我们的社会里，任何不在母亲葬礼上哭泣的人，都有被判死刑的危险。", page: "第二部" },
    ],
  },
  {
    id: "norwegian-wood",
    title: "挪威的森林",
    author: "村上春树",
    category: "日本文学",
    year: "1987",
    pages: "384",
    rating: "8.4",
    desc: "渡边彻在飞机上听到《挪威的森林》旋律，回忆起大学时代与直子和绿子之间的感情纠葛。一段关于青春、爱情、孤独与死亡的动人故事。",
    coverBg: "linear-gradient(145deg, #1a3a2a, #2a5a3a, #1a3a2a)",
    coverTitle: "挪威的森林",
    coverAuthor: "村上春树",
    quotes: [
      { text: "每个人都有属于自己的一片森林，也许我们从来不曾去过，但它一直在那里，总会在那里。迷失的人迷失了，相逢的人会再相逢。", page: "第一章" },
      { text: "不要同情自己，同情自己是卑劣懦夫干的勾当。", page: "第五章" },
      { text: "死并非生的对立面，而作为生的一部分永存。", page: "第三章" },
      { text: "哪里会有人喜欢孤独，不过是不喜欢失望罢了。", page: "第七章" },
      { text: "不管全世界所有人怎么说，我都认为自己的感受才是正确的。无论别人怎么看，我绝不打乱自己的节奏。", page: "第九章" },
    ],
  },
  {
    id: "three-body",
    title: "三体",
    author: "刘慈欣",
    category: "科幻小说",
    year: "2008",
    pages: "302",
    rating: "9.3",
    desc: "文化大革命如火如荼进行的同时，军方探寻外星文明的绝秘计划取得了突破性进展。半个世纪后，叶文洁的行为彻底改变了人类的命运。",
    coverBg: "linear-gradient(145deg, #0a1a3a, #1a3a6a, #0a1a3a)",
    coverTitle: "三体",
    coverAuthor: "刘慈欣",
    quotes: [
      { text: "给岁月以文明，而不是给文明以岁月。", page: "第二部" },
      { text: "弱小和无知不是生存的障碍，傲慢才是。", page: "第三部" },
      { text: "在宇宙中，你再快都有比你更快的，你再慢也有比你更慢的。", page: "第一部" },
      { text: "失去人性，失去很多；失去兽性，失去一切。", page: "第一部" },
      { text: "我们都是阴沟里的虫子，但总还是得有人仰望星空。", page: "第二部" },
    ],
  },
  {
    id: "love-in-cholera",
    title: "霍乱时期��爱���",
    author: "加西亚·马尔克斯",
    category: "爱情文学",
    year: "1985",
    pages: "401",
    rating: "9.0",
    desc: "讲述了一段跨越半个多世纪的爱情故事。弗洛伦蒂诺在年轻时爱上了费尔明娜，被拒绝后他等待了五十一年九个月零四天，终于等到了再续前缘的机会。",
    coverBg: "linear-gradient(145deg, #8a1a3a, #b52a4a, #8a1a3a)",
    coverTitle: "霍乱时期的爱情",
    coverAuthor: "马尔克斯",
    quotes: [
      { text: "趁年轻，好好利用这个机会，尽力去尝遍所有痛苦，这种事可不是一辈子什么时候都会遇到的。", page: "第三章" },
      { text: "只有上帝知道我有多爱你。", page: "第五章" },
      { text: "诚实的生活方式其实是按照自己身体的意愿行事，饿的时候才吃饭，爱的时候不必撒谎。", page: "第四章" },
      { text: "心灵的爱情在腰部以上，肉体的爱情在腰部以下。", page: "第二章" },
      { text: "一个人最初和父亲相象之日，也就是他开始衰老之时。", page: "第六章" },
    ],
  },
  {
    id: "1984",
    title: "1984",
    author: "乔治·奥威尔",
    category: "反乌托邦",
    year: "1949",
    pages: "328",
    rating: "9.4",
    desc: "在大洋国，思想是罪行，自由即奴役，战争即和平。温斯顿在真理部工作，负责篡改历史记录。他开始质疑党的统治，并秘密地爱上了朱莉亚。",
    coverBg: "linear-gradient(145deg, #3a0a0a, #6a1a1a, #3a0a0a)",
    coverTitle: "1984",
    coverAuthor: "奥威尔",
    quotes: [
      { text: "谁控制过去就控制未来，谁控制现在就控制过去。", page: "第一部" },
      { text: "在普遍欺骗的时代，说出真相是一种革命行为。", page: "第二部" },
      { text: "战争即和平，自由即奴役，无知即力量。", page: "第一部" },
      { text: "所谓自由就是可以说二加二等于四的自由。", page: "第一部" },
      { text: "如果你想要一幅关于未来的画面，想象一只靴子踩在人脸上——永远。", page: "第三部" },
    ],
  },
  {
    id: "no-longer-human",
    title: "人间失格",
    author: "太宰治",
    category: "日本文学",
    year: "1948",
    pages: "176",
    rating: "8.5",
    desc: "大庭叶藏从小就对人类的生活充满恐惧和不安，他用搞笑来掩饰内心的痛苦，在酗酒、药物和女人之间沉沦。这是太宰治最后的作品，也是他灵魂的自画像。",
    coverBg: "linear-gradient(145deg, #1a1a2a, #2a2a4a, #1a1a2a)",
    coverTitle: "人间失格",
    coverAuthor: "太宰治",
    quotes: [
      { text: "生而为人，我很抱歉。", page: "第三手札" },
      { text: "胆小鬼连幸福都害怕，碰到棉花都会受伤。", page: "第一手札" },
      { text: "我的不幸，恰恰在于我缺乏拒绝的能力。我害怕一旦拒绝别人，便会在彼此心里留下永远无法愈合的裂痕。", page: "第二手札" },
      { text: "若能避开猛烈的狂喜，自然也不会有悲痛的来袭。", page: "第三手札" },
      { text: "相互轻蔑却又彼此来往，并一起自我作贱——这就是世上所谓朋友的真面目。", page: "第二手札" },
    ],
  },
];

export function getBookForDate(date: Date): Book {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const index = ((hash % books.length) + books.length) % books.length;
  return books[index];
}

export function getTodayBook(): Book {
  return getBookForDate(new Date());
}

export function getRecentBooks(days: number): { date: Date; book: Book }[] {
  const result: { date: Date; book: Book }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    result.push({ date, book: getBookForDate(date) });
  }
  return result;
}

export function formatDate(date: Date): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${weekdays[date.getDay()]}`;
}

export function formatDateShort(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
