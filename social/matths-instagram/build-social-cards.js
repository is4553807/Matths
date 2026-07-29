const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
process.env.FONTCONFIG_FILE = path.join(ROOT, "fontconfig.xml");
const sharp = require("sharp");

const ASSETS = path.join(ROOT, "assets");
const OUT = {
  feed1: path.join(ROOT, "feed-1-visual"),
  feed2: path.join(ROOT, "feed-2-wrong-answer"),
  feed3: path.join(ROOT, "feed-3-challenge"),
  preview: path.join(ROOT, "preview"),
};

const W = 1080;
const H = 1440;
const FONT =
  "'LINE Seed Sans KR','Apple SD Gothic Neo','Helvetica Neue',Arial,sans-serif";
const DISPLAY_FONT =
  "'Bagel Fat One','LINE Seed Sans KR','Apple SD Gothic Neo',sans-serif";
const MONO =
  "'LINE Seed Sans KR','SFMono-Regular','SF Mono',Menlo,monospace";
const C = {
  blue: "#3157F6",
  lightBlue: "#E9EDFF",
  navy: "#0E1428",
  navy2: "#202C61",
  white: "#FFFFFF",
  paper: "#F6F7FD",
  ink: "#101426",
  muted: "#7D8797",
  line: "#DDE2EF",
  coral: "#EF6375",
  coralBg: "#FFE8EC",
  mint: "#32B99A",
  mintBg: "#E4F7F1",
  orange: "#42BBD7",
  orangeBg: "#E5F7FB",
  violet: "#7454FF",
  violetBg: "#EEE9FF",
};

Object.values(OUT).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svg(width, height, body, defs = "") {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${C.navy}"/>
          <stop offset="100%" stop-color="${C.navy2}"/>
        </linearGradient>
        <linearGradient id="blueGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${C.blue}"/>
          <stop offset="100%" stop-color="${C.violet}"/>
        </linearGradient>
        <linearGradient id="pinkGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${C.coral}"/>
          <stop offset="100%" stop-color="${C.violet}"/>
        </linearGradient>
        <radialGradient id="softGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${C.blue}" stop-opacity=".45"/>
          <stop offset="100%" stop-color="${C.blue}" stop-opacity="0"/>
        </radialGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="24" stdDeviation="28"
            flood-color="#071027" flood-opacity=".20"/>
        </filter>
        <filter id="smallShadow" x="-20%" y="-30%" width="140%" height="180%">
          <feDropShadow dx="0" dy="14" stdDeviation="16"
            flood-color="#071027" flood-opacity=".14"/>
        </filter>
        ${defs}
      </defs>
      ${body}
    </svg>`);
}

function textBlock(lines, x, y, opts = {}) {
  const {
    size = 68,
    lineHeight = Math.round(size * 1.2),
    fill = C.white,
    weight,
    anchor = "start",
    family,
    letterSpacing,
    opacity = 1,
  } = opts;
  const resolvedFamily = family ?? (size >= 40 ? DISPLAY_FONT : FONT);
  const resolvedWeight = weight ?? (size >= 40 ? 400 : 700);
  const resolvedLetterSpacing =
    letterSpacing ?? (size >= 40 ? -0.8 : size >= 26 ? -0.15 : 0.15);
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${resolvedFamily}"
      font-size="${size}" font-weight="${resolvedWeight}" text-anchor="${anchor}"
      letter-spacing="${resolvedLetterSpacing}" opacity="${opacity}">
    ${lines
      .map(
        (line, index) =>
          `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`
      )
      .join("")}
  </text>`;
}

function pill(text, x, y, opts = {}) {
  const {
    dark = false,
    fill = dark ? "#FFFFFF16" : C.lightBlue,
    textFill = dark ? "#C9D2F5" : C.blue,
    width = Math.max(190, String(text).length * 13 + 74),
  } = opts;
  return `
    <rect x="${x}" y="${y}" width="${width}" height="50" rx="25"
      fill="${fill}" stroke="${dark ? "#FFFFFF22" : "#3157F61E"}"/>
    <circle cx="${x + 25}" cy="${y + 25}" r="5.5"
      fill="${dark ? "#8EA1FF" : C.blue}"/>
    <text x="${x + 43}" y="${y + 32}" fill="${textFill}"
      font-family="${MONO}" font-size="15" font-weight="800"
      letter-spacing="1.7">${esc(text)}</text>`;
}

function chip(text, x, y, width, opts = {}) {
  const {
    fill = C.white,
    textFill = C.ink,
    stroke = C.line,
    size = 22,
  } = opts;
  return `
    <rect x="${x}" y="${y}" width="${width}" height="66" rx="22"
      fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <text x="${x + width / 2}" y="${y + 42}" fill="${textFill}"
      font-family="${FONT}" font-size="${size}" font-weight="800"
      text-anchor="middle">${esc(text)}</text>`;
}

function footer(feed, dark = false) {
  return `
    <text x="72" y="1302" fill="#AAB4CF"
      font-family="${MONO}" font-size="16" font-weight="750"
      letter-spacing="2">MATTHS · ${esc(feed)}</text>`;
}

function brandHeader(dark = false) {
  return {
    overlay: `
      <text x="150" y="104" fill="${dark ? C.white : C.ink}"
        font-family="${FONT}" font-size="33" font-weight="850"
        letter-spacing="-1.2">Matths</text>
      <text x="1008" y="102" fill="${dark ? "#AAB4CF" : C.muted}"
        font-family="${MONO}" font-size="14" font-weight="750"
        text-anchor="end" letter-spacing="2">HIGH SCHOOL ONLY</text>`,
    logo: {
      input: path.join(ASSETS, "brand-mark-header.png"),
      left: 72,
      top: 58,
    },
  };
}

function basePaper(accent = C.blue) {
  return svg(W, H, `
    <rect width="${W}" height="${H}" fill="${C.paper}"/>
    <circle cx="1010" cy="90" r="350" fill="${accent}" opacity=".055"/>
    <path d="M-30 1120 C260 1020 420 1200 720 1110 S1080 1040 1190 1170"
      fill="none" stroke="${accent}" stroke-width="2" opacity=".09"/>
  `);
}

function baseDark() {
  return svg(W, H, `
    <rect width="${W}" height="${H}" fill="url(#dark)"/>
    <circle cx="850" cy="390" r="480" fill="url(#softGlow)" opacity=".7"/>
    <path d="M0 220 H1080 M0 460 H1080 M0 700 H1080 M0 940 H1080"
      stroke="#FFFFFF" stroke-opacity=".035"/>
    <path d="M180 0 V1440 M420 0 V1440 M660 0 V1440 M900 0 V1440"
      stroke="#FFFFFF" stroke-opacity=".035"/>
  `);
}

async function roundedImage(
  inputPath,
  width,
  height,
  radius = 30,
  fit = "cover",
  position = "top"
) {
  const image = await sharp(inputPath)
    .resize(width, height, { fit, position })
    .toBuffer();
  const mask = svg(
    width,
    height,
    `<rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/>`
  );
  return sharp(image)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function featureCrop(
  inputPath,
  extract,
  width,
  height,
  radius = 30
) {
  const image = await sharp(inputPath)
    .extract(extract)
    .resize(width, height, { fit: "fill" })
    .toBuffer();
  const mask = svg(
    width,
    height,
    `<rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/>`
  );
  return sharp(image)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function renderCard(outputPath, { base, layers = [], overlay = "" }) {
  const header = brandHeader(true);
  const composites = [];
  composites.push(
    base.input
      ? { input: base.input, left: 0, top: 0 }
      : { input: baseDark() }
  );
  composites.push(...layers);
  composites.push(header.logo);
  composites.push({
    input: svg(W, H, `${header.overlay}${overlay}`),
    left: 0,
    top: 0,
  });
  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toFile(outputPath);
}

async function prepareBrandMark() {
  const source = "/Users/sangyoonlee/Desktop/Matths Logo.png";
  const trimmed = await sharp(source)
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: 8,
    })
    .png()
    .toBuffer();
  await sharp(trimmed)
    .resize(70, 70, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(ASSETS, "brand-mark-header.png"));
  await sharp(trimmed)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(ASSETS, "brand-mark.png"));
}

async function createCovers() {
  const panorama = await sharp(path.join(ASSETS, "pinned-panorama-bg.png"))
    .resize(3240, 1080, { fit: "fill" })
    .extend({
      top: 180,
      bottom: 180,
      left: 0,
      right: 0,
      background: C.navy,
    })
    .modulate({ brightness: 0.7, saturation: 0.92 })
    .toBuffer();
  const mark = await sharp(path.join(ASSETS, "brand-mark.png"))
    .resize(230, 230)
    .toBuffer();
  const body = `
    <rect width="3240" height="1440" fill="#071022" opacity=".18"/>
    <linearGradient id="coverShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#071022" stop-opacity=".08"/>
      <stop offset="72%" stop-color="#071022" stop-opacity=".06"/>
      <stop offset="100%" stop-color="#071022" stop-opacity=".68"/>
    </linearGradient>
    <rect width="3240" height="1440" fill="url(#coverShade)"/>

    ${pill("COMMUNITY PLAYGROUND", 86, 92, { dark: true, width: 330 })}
    ${pill("EXAM REPLAY", 1166, 92, { dark: true, width: 245 })}
    ${pill("WAR OF GOAT", 2246, 92, { dark: true, width: 245 })}

    ${textBlock(["수학앱인데,"], 540, 520, {
      size: 145, fill: C.white, lineHeight: 150, anchor: "middle",
    })}
    ${textBlock(["왜 재밌지?"], 2700, 520, {
      size: 145, fill: C.white, anchor: "middle", lineHeight: 150,
    })}

    <text x="1620" y="730" fill="${C.white}" font-family="${FONT}"
      font-size="124" font-weight="850" text-anchor="middle"
      letter-spacing="-4">Matths</text>
    <text x="1620" y="776" fill="#B7C4EC" font-family="${MONO}"
      font-size="18" font-weight="800" text-anchor="middle"
      letter-spacing="3.5">HIGH SCHOOL MATH PLAYGROUND</text>
    <rect x="1360" y="824" width="520" height="1" fill="#FFFFFF38"/>
    <text x="1620" y="888" fill="#EEF1FF" font-family="${FONT}"
      font-size="28" font-weight="700" text-anchor="middle">
      고딩 수학은 좀 더 재밌어도 된다.
    </text>

    <text x="92" y="1260" fill="#D6DDF5" font-family="${FONT}"
      font-size="21" font-weight="650">게시판 · 40초 게임 · 스트레스 배출</text>
    <text x="1620" y="1260" fill="#D6DDF5" font-family="${FONT}"
      font-size="21" font-weight="650" text-anchor="middle">모의고사를 콘텐츠로</text>
    <text x="3144" y="1260" fill="#D6DDF5" font-family="${FONT}"
      font-size="21" font-weight="650" text-anchor="end">일요일엔 랭킹전</text>`;

  const composed = await sharp(panorama)
    .composite([
      { input: svg(3240, 1440, body) },
      { input: mark, left: 1505, top: 330 },
    ])
    .png()
    .toBuffer();
  await sharp(composed)
    .extract({ left: 0, top: 0, width: 1080, height: 1440 })
    .toFile(path.join(OUT.feed1, "feed-1-page-01-cover.png"));
  await sharp(composed)
    .extract({ left: 1080, top: 0, width: 1080, height: 1440 })
    .toFile(path.join(OUT.feed2, "feed-2-page-01-cover.png"));
  await sharp(composed)
    .extract({ left: 2160, top: 0, width: 1080, height: 1440 })
    .toFile(path.join(OUT.feed3, "feed-3-page-01-cover.png"));
  await sharp(composed).toFile(
    path.join(OUT.preview, "cover-panorama-master.png")
  );
}

async function feedOne() {
  const community = await featureCrop(
    path.join(ASSETS, "screen-community.jpg"),
    { left: 80, top: 108, width: 1120, height: 398 },
    936,
    333
  );
  await renderCard(path.join(OUT.feed1, "feed-1-page-02-community.png"), {
    base: { dark: false, accent: C.blue },
    layers: [{ input: community, left: 72, top: 610 }],
    overlay: `
      ${pill("전체 게시판 · 학교 게시판", 72, 158, { width: 330 })}
      ${textBlock(["전체 글부터", "우리 학교 글까지."], 72, 300, {
        size: 66, lineHeight: 82,
      })}
      ${textBlock(["통합 고등학교 게시판과 학교별 게시판."], 72, 500, {
        size: 25, fill: "#B8C2DF", weight: 650,
      })}
      <rect x="72" y="1007" width="216" height="70" rx="24"
        fill="${C.blue}"/>
      <rect x="306" y="1007" width="216" height="70" rx="24"
        fill="#FFFFFF0D" stroke="#FFFFFF22"/>
      <rect x="540" y="1007" width="216" height="70" rx="24"
        fill="#FFFFFF0D" stroke="#FFFFFF22"/>
      <text x="180" y="1051" fill="${C.white}" font-family="${FONT}"
        font-size="20" font-weight="850" text-anchor="middle">전체</text>
      <text x="414" y="1051" fill="#C8D1ED" font-family="${FONT}"
        font-size="20" font-weight="780" text-anchor="middle">우리 학교</text>
      <text x="648" y="1051" fill="#C8D1ED" font-family="${FONT}"
        font-size="20" font-weight="780" text-anchor="middle">인기 글</text>
      ${footer("COMMUNITY PLAYGROUND")}
    `,
  });

  await renderCard(path.join(OUT.feed1, "feed-1-page-03-quick-game.png"), {
    base: { dark: true },
    overlay: `
      ${pill("40 SEC QUICK PLAY", 72, 158, { dark: true, width: 300 })}
      ${textBlock(["급식 줄 40초.", "한 문제 클리어."], 72, 292, {
        size: 72, lineHeight: 88, fill: C.white,
      })}
      <circle cx="912" cy="282" r="82" fill="${C.navy}"/>
      <circle cx="912" cy="282" r="68" fill="none" stroke="#8FA5FF"
        stroke-width="10" stroke-dasharray="340 90" stroke-linecap="round"/>
      <text x="912" y="298" fill="${C.white}" font-family="${MONO}"
        font-size="42" font-weight="850" text-anchor="middle">40s</text>

      <rect x="72" y="594" width="936" height="434" rx="42"
        fill="url(#blueGlow)" filter="url(#shadow)"/>
      <text x="118" y="654" fill="#C7D2FF" font-family="${MONO}"
        font-size="15" font-weight="850" letter-spacing="2">Q.03 · 2점</text>
      <text x="118" y="770" fill="${C.white}" font-family="${DISPLAY_FONT}"
        font-size="72" font-weight="400">3x − 7 = 11</text>
      <text x="118" y="825" fill="#DCE3FF" font-family="${FONT}"
        font-size="22" font-weight="700">x의 값을 머릿속으로 계산하세요.</text>

      <rect x="118" y="882" width="190" height="86" rx="27"
        fill="#FFFFFF18" stroke="#FFFFFF26"/>
      <text x="213" y="938" fill="${C.white}" font-family="${FONT}"
        font-size="30" font-weight="850" text-anchor="middle">4</text>
      <rect x="328" y="882" width="190" height="86" rx="27"
        fill="${C.white}"/>
      <text x="423" y="938" fill="${C.blue}" font-family="${FONT}"
        font-size="30" font-weight="850" text-anchor="middle">6</text>
      <rect x="538" y="882" width="190" height="86" rx="27"
        fill="#FFFFFF18" stroke="#FFFFFF26"/>
      <text x="633" y="938" fill="${C.white}" font-family="${FONT}"
        font-size="30" font-weight="850" text-anchor="middle">8</text>
      <circle cx="880" cy="808" r="82" fill="#0D1533" opacity=".72"/>
      <text x="880" y="797" fill="#92A5FF" font-family="${MONO}"
        font-size="14" font-weight="850" text-anchor="middle">STREAK</text>
      <text x="880" y="855" fill="${C.white}" font-family="${DISPLAY_FONT}"
        font-size="48" font-weight="400" text-anchor="middle">12</text>

      <path d="M72 1104 H1008" stroke="#FFFFFF1F" stroke-width="2"/>
      <text x="72" y="1168" fill="#8DDBEC" font-family="${MONO}"
        font-size="17" font-weight="850" letter-spacing="1.7">NEW NUMBERS · EVERY ROUND</text>
      <text x="1008" y="1168" fill="${C.white}" font-family="${FONT}"
        font-size="22" font-weight="800" text-anchor="end">기록 21.7초 ↗</text>
      ${footer("COMMUNITY PLAYGROUND", true)}
    `,
  });

  await renderCard(path.join(OUT.feed1, "feed-1-page-04-stress-board.png"), {
    base: { dark: true },
    overlay: `
      ${pill("STRESS DUMP", 72, 158, { dark: true, width: 235 })}
      ${textBlock(["문제 진짜", "엿같이 만들었네"], 72, 300, {
        size: 78, lineHeight: 92, fill: C.white,
      })}
      ${textBlock(["그 문장을 그대로 적어둔다."], 72, 520, {
        size: 25, fill: "#B8C2DF", weight: 650,
      })}

      <rect x="72" y="598" width="936" height="230" rx="32"
        fill="#FFFFFF10" stroke="#FFFFFF22"/>
      <text x="110" y="652" fill="#8EA1D6" font-family="${MONO}"
        font-size="15" font-weight="800" letter-spacing="2">오늘의 스트레스</text>
      <text x="110" y="734" fill="${C.white}" font-family="${FONT}"
        font-size="38" font-weight="850">“문제 진짜 엿같이 만들었네.”</text>
      <rect x="110" y="766" width="180" height="38" rx="19"
        fill="${C.coral}"/>
      <text x="200" y="792" fill="${C.white}" font-family="${FONT}"
        font-size="17" font-weight="800" text-anchor="middle">배출 완료</text>

      <path d="M540 854 C540 900 540 918 540 952" fill="none"
        stroke="#8298FF" stroke-width="4" stroke-linecap="round"/>
      <path d="M528 940 L540 954 L552 940" fill="none"
        stroke="#8298FF" stroke-width="4" stroke-linecap="round"/>

      <rect x="72" y="986" width="936" height="210" rx="32"
        fill="${C.white}" filter="url(#shadow)"/>
      <text x="110" y="1042" fill="${C.blue}" font-family="${MONO}"
        font-size="15" font-weight="850" letter-spacing="2">3일 뒤 · 오답 리벤지</text>
      ${textBlock(
        ["“문제가 엿같은게 아니라", "니 수학 실력이 엿같은거야”"],
        110,
        1100,
        {
          size: 31,
          lineHeight: 42,
          fill: C.ink,
          weight: 850,
          letterSpacing: -1.2,
        }
      )}
      ${footer("COMMUNITY PLAYGROUND", true)}
    `,
  });

  await renderCard(path.join(OUT.feed1, "feed-1-page-05-goat-shop.png"), {
    base: { dark: true },
    overlay: `
      ${pill("GOAT SHOP", 72, 158, { dark: true, width: 210 })}
      ${textBlock(["랭킹 코인을", "기프티콘으로."], 72, 300, {
        size: 76, lineHeight: 90, fill: C.white,
      })}
      ${textBlock(["랭킹전과 방어 보상으로 모은 코인을 교환한다."], 72, 510, {
        size: 25, fill: "#B8C2DF", weight: 650,
      })}

      <circle cx="272" cy="830" r="176" fill="url(#blueGlow)"
        filter="url(#shadow)"/>
      <circle cx="272" cy="830" r="143" fill="none" stroke="#FFFFFF40"
        stroke-width="3" stroke-dasharray="8 14"/>
      <text x="272" y="790" fill="#D8DEFF" font-family="${MONO}"
        font-size="17" font-weight="850" text-anchor="middle"
        letter-spacing="2">GOAT COIN</text>
      <text x="272" y="886" fill="${C.white}" font-family="${DISPLAY_FONT}"
        font-size="82" font-weight="400" text-anchor="middle">480</text>

      <path d="M450 830 C510 830 520 730 586 730" fill="none"
        stroke="#8298FF" stroke-width="5" stroke-linecap="round"/>
      <path d="M450 830 C510 830 520 930 586 930" fill="none"
        stroke="#8298FF" stroke-width="5" stroke-linecap="round"/>

      <g transform="rotate(-3 782 700)">
        <rect x="574" y="622" width="416" height="160" rx="34"
          fill="${C.white}" filter="url(#smallShadow)"/>
        <text x="610" y="674" fill="${C.blue}" font-family="${MONO}"
          font-size="14" font-weight="850">GIFT 01</text>
        <text x="610" y="736" fill="${C.ink}" font-family="${FONT}"
          font-size="31" font-weight="850">편의점 5,000원</text>
        <circle cx="930" cy="702" r="28" fill="${C.coralBg}"/>
      </g>
      <g transform="rotate(3 782 900)">
        <rect x="574" y="826" width="416" height="160" rx="34"
          fill="${C.violetBg}" filter="url(#smallShadow)"/>
        <text x="610" y="878" fill="${C.violet}" font-family="${MONO}"
          font-size="14" font-weight="850">GIFT 02</text>
        <text x="610" y="940" fill="${C.ink}" font-family="${FONT}"
          font-size="31" font-weight="850">카페 · 문화상품권</text>
        <circle cx="930" cy="906" r="28" fill="#D5CCFF"/>
      </g>

      <rect x="72" y="1090" width="936" height="86" rx="28"
        fill="#FFFFFF0D" stroke="#FFFFFF20"/>
      <text x="116" y="1144" fill="#9EAFE0" font-family="${MONO}"
        font-size="15" font-weight="850">PLAY</text>
      <text x="242" y="1144" fill="${C.white}" font-family="${FONT}"
        font-size="22" font-weight="850">랭킹전</text>
      <text x="388" y="1144" fill="#8298FF" font-family="${FONT}"
        font-size="24" font-weight="850">→</text>
      <text x="468" y="1144" fill="#9EAFE0" font-family="${MONO}"
        font-size="15" font-weight="850">EARN</text>
      <text x="604" y="1144" fill="${C.white}" font-family="${FONT}"
        font-size="22" font-weight="850">코인</text>
      <text x="714" y="1144" fill="#8298FF" font-family="${FONT}"
        font-size="24" font-weight="850">→</text>
      <text x="790" y="1144" fill="#8DDBEC" font-family="${MONO}"
        font-size="15" font-weight="850">EXCHANGE</text>
      ${footer("GOAT SHOP", true)}
    `,
  });
}

async function feedTwo() {
  await renderCard(path.join(OUT.feed2, "feed-2-page-02-weekly-drop.png"), {
    base: { dark: true },
    overlay: `
      ${pill("WEEKLY DROP", 72, 158, { dark: true, width: 230 })}
      ${textBlock(["이번 주", "모의고사 드롭."], 72, 290, {
        size: 70, lineHeight: 88, fill: C.white,
      })}

      <g transform="rotate(-2 540 760)">
        <rect x="72" y="584" width="936" height="356" rx="42"
          fill="${C.white}" filter="url(#shadow)"/>
        <rect x="72" y="584" width="630" height="356" rx="42"
          fill="${C.blue}"/>
        <path d="M702 610 V914" stroke="#CCD4F4" stroke-width="3"
          stroke-dasharray="8 12"/>
        <text x="118" y="646" fill="#C9D4FF" font-family="${MONO}"
          font-size="15" font-weight="850" letter-spacing="2">MATTHS PRIVATE MOCK · #07</text>
        <text x="118" y="748" fill="${C.white}" font-family="${DISPLAY_FONT}"
          font-size="54" font-weight="400">한 번의 실수 대신,</text>
        <text x="118" y="816" fill="${C.white}" font-family="${DISPLAY_FONT}"
          font-size="54" font-weight="400">세 번의 도전.</text>
        <text x="118" y="884" fill="#DCE3FF" font-family="${FONT}"
          font-size="21" font-weight="700">100분 · 공통 22문항 · 선택 8문항</text>

        <text x="855" y="654" fill="${C.coral}" font-family="${MONO}"
          font-size="15" font-weight="850" text-anchor="middle">OPEN IN</text>
        <text x="855" y="788" fill="${C.ink}" font-family="${DISPLAY_FONT}"
          font-size="88" font-weight="400" text-anchor="middle">D-4</text>
        <text x="855" y="862" fill="${C.muted}" font-family="${FONT}"
          font-size="20" font-weight="750" text-anchor="middle">SUNDAY · KST</text>
      </g>

      ${chip("A · 15:00–16:40", 72, 1010, 286, {
        fill: "#FFFFFF14", textFill: C.white, stroke: "#FFFFFF20", size: 18,
      })}
      ${chip("B · 18:00–19:40", 374, 1010, 286, {
        fill: "#FFFFFF14", textFill: C.white, stroke: "#FFFFFF20", size: 18,
      })}
      ${chip("C · 21:00–22:40", 676, 1010, 286, {
        fill: "#FFFFFF14", textFill: C.white, stroke: "#FFFFFF20", size: 18,
      })}
      ${footer("EXAM REPLAY", true)}
    `,
  });

  const archive = await featureCrop(
    path.join(ASSETS, "screen-archive-full.jpg"),
    { left: 50, top: 296, width: 1180, height: 504 },
    936,
    400
  );
  await renderCard(path.join(OUT.feed2, "feed-2-page-03-archive.png"), {
    base: { dark: false, accent: C.orange },
    layers: [{ input: archive, left: 72, top: 580 }],
    overlay: `
      ${pill("PAST EXAMS", 72, 158, {
        fill: C.orangeBg, textFill: "#178DAA", width: 230,
      })}
      ${textBlock(["과거 기출을", "한곳에."], 72, 292, {
        size: 72, lineHeight: 88,
      })}
      ${textBlock(["최근 5개년 · 학교별 기출 · 주간 모의고사"], 72, 500, {
        size: 24, fill: "#B8C2DF", weight: 650,
      })}
      ${footer("EXAM REPLAY")}
    `,
  });

  await renderCard(path.join(OUT.feed2, "feed-2-page-04-solution-replay.png"), {
    base: { dark: true },
    overlay: `
      ${pill("SOLUTION REPLAY", 72, 158, { dark: true, width: 275 })}
      ${textBlock(["막힌 14초만", "다시 본다."], 72, 292, {
        size: 74, lineHeight: 88, fill: C.white,
      })}
      ${textBlock(["푼 순서 · 멈춘 지점 · 다음 문제까지 자동 연결."], 72, 500, {
        size: 24, fill: "#B8C2DF", weight: 650,
      })}

      <text x="972" y="638" fill="#FFFFFF0B" font-family="${DISPLAY_FONT}"
        font-size="154" font-weight="400" text-anchor="end">REPLAY</text>
      <path d="M150 822 C330 712 490 932 670 806 S924 728 986 790"
        fill="none" stroke="#8298FF" stroke-width="5"
        stroke-linecap="round" stroke-dasharray="10 16"/>

      <g transform="rotate(-5 222 820)">
        <rect x="72" y="664" width="300" height="350" rx="38"
          fill="#FFFFFF10" stroke="#FFFFFF26"/>
        <text x="112" y="724" fill="#9EAFE0" font-family="${MONO}"
          font-size="15" font-weight="850">00:14 · PAUSE</text>
        <circle cx="222" cy="830" r="68" fill="${C.coral}"/>
        <text x="222" y="848" fill="${C.white}" font-family="${DISPLAY_FONT}"
          font-size="48" font-weight="400" text-anchor="middle">?</text>
        <text x="112" y="958" fill="${C.white}" font-family="${FONT}"
          font-size="27" font-weight="850">막힌 지점 포착</text>
      </g>

      <g transform="rotate(3 526 826)">
        <rect x="376" y="650" width="300" height="376" rx="38"
          fill="${C.blue}" filter="url(#smallShadow)"/>
        <text x="416" y="710" fill="#C9D4FF" font-family="${MONO}"
          font-size="15" font-weight="850">STEP BY STEP</text>
        <circle cx="526" cy="832" r="72" fill="${C.white}"/>
        <path d="M508 794 L566 832 L508 870 Z" fill="${C.blue}"/>
        <text x="416" y="970" fill="${C.white}" font-family="${FONT}"
          font-size="27" font-weight="850">풀이 흐름 재생</text>
      </g>

      <g transform="rotate(-2 830 820)">
        <rect x="680" y="676" width="300" height="340" rx="38"
          fill="${C.violetBg}" filter="url(#smallShadow)"/>
        <text x="720" y="736" fill="${C.violet}" font-family="${MONO}"
          font-size="15" font-weight="850">NEXT MATCH</text>
        <text x="830" y="860" fill="${C.violet}" font-family="${DISPLAY_FONT}"
          font-size="74" font-weight="400" text-anchor="middle">+1</text>
        <text x="720" y="960" fill="${C.ink}" font-family="${FONT}"
          font-size="27" font-weight="850">유사 문제 생성</text>
      </g>

      <rect x="72" y="1082" width="936" height="86" rx="28"
        fill="#FFFFFF0C" stroke="#FFFFFF20"/>
      <text x="112" y="1137" fill="#8DDBEC" font-family="${MONO}"
        font-size="16" font-weight="850">14 SEC LOST</text>
      <text x="944" y="1137" fill="${C.white}" font-family="${FONT}"
        font-size="23" font-weight="850" text-anchor="end">다음 문제에서는 안 막히게 →</text>
      ${footer("EXAM REPLAY", true)}
    `,
  });

  const wrong = await featureCrop(
    path.join(ASSETS, "screen-wrong-notes-full.jpg"),
    { left: 326, top: 813, width: 888, height: 274 },
    936,
    289
  );
  await renderCard(path.join(OUT.feed2, "feed-2-page-05-wrong-revenge.png"), {
    base: { dark: false, accent: C.coral },
    layers: [{ input: wrong, left: 72, top: 620 }],
    overlay: `
      ${pill("WRONG ANSWER REVENGE", 72, 158, {
        fill: C.coralBg, textFill: C.coral, width: 340,
      })}
      ${textBlock(["틀린 문제는", "비슷한 유형으로 다시."], 72, 292, {
        size: 68, lineHeight: 84,
      })}
      ${textBlock(["오답 저장 → 막힌 지점 확인 → 새 문제로 복수"], 72, 500, {
        size: 24, fill: "#B8C2DF", weight: 650,
      })}
      ${footer("EXAM REPLAY")}
    `,
  });

  await renderCard(path.join(OUT.feed2, "feed-2-page-06-exam-engine.png"), {
    base: { dark: true },
    overlay: `
      ${pill("UPLOAD ONCE", 72, 158, { dark: true, width: 235 })}
      ${textBlock(["PDF 하나가", "콘텐츠 네 개로."], 72, 300, {
        size: 72, lineHeight: 88, fill: C.white,
      })}
      ${textBlock(["시험지를 올리면 복습 루프가 바로 시작된다."], 72, 510, {
        size: 25, fill: "#B8C2DF", weight: 650,
      })}

      <text x="990" y="842" fill="#FFFFFF08" font-family="${DISPLAY_FONT}"
        font-size="300" font-weight="400" text-anchor="end">×4</text>

      <g transform="rotate(-5 250 820)">
        <rect x="78" y="628" width="344" height="396" rx="42"
          fill="${C.white}" filter="url(#shadow)"/>
        <rect x="112" y="666" width="276" height="72" rx="24"
          fill="${C.lightBlue}"/>
        <text x="250" y="712" fill="${C.blue}" font-family="${MONO}"
          font-size="16" font-weight="850" text-anchor="middle">DROP YOUR FILE</text>
        <text x="250" y="860" fill="${C.ink}" font-family="${DISPLAY_FONT}"
          font-size="84" font-weight="400" text-anchor="middle">PDF</text>
        <text x="250" y="936" fill="${C.muted}" font-family="${FONT}"
          font-size="21" font-weight="750" text-anchor="middle">모의고사 업로드</text>
      </g>

      <path d="M422 820 C500 690 530 678 590 682" fill="none"
        stroke="#8298FF" stroke-width="4" stroke-linecap="round"/>
      <path d="M422 820 C500 792 530 796 590 800" fill="none"
        stroke="#8298FF" stroke-width="4" stroke-linecap="round"/>
      <path d="M422 820 C500 910 530 914 590 918" fill="none"
        stroke="#8298FF" stroke-width="4" stroke-linecap="round"/>
      <path d="M422 820 C500 1018 530 1030 590 1034" fill="none"
        stroke="#8298FF" stroke-width="4" stroke-linecap="round"/>

      <rect x="590" y="626" width="390" height="102" rx="31"
        fill="${C.blue}"/>
      <text x="632" y="689" fill="${C.white}" font-family="${FONT}"
        font-size="27" font-weight="850">01 · 자동 채점</text>
      <rect x="590" y="746" width="390" height="102" rx="31"
        fill="${C.violet}"/>
      <text x="632" y="809" fill="${C.white}" font-family="${FONT}"
        font-size="27" font-weight="850">02 · 풀이 리플레이</text>
      <rect x="590" y="866" width="390" height="102" rx="31"
        fill="${C.coral}"/>
      <text x="632" y="929" fill="${C.white}" font-family="${FONT}"
        font-size="27" font-weight="850">03 · 오답노트</text>
      <rect x="590" y="986" width="390" height="102" rx="31"
        fill="${C.orange}"/>
      <text x="632" y="1049" fill="${C.navy}" font-family="${FONT}"
        font-size="27" font-weight="850">04 · 유사 문제</text>

      <text x="72" y="1174" fill="#8DDBEC" font-family="${MONO}"
        font-size="17" font-weight="850" letter-spacing="1.8">UPLOAD ONCE · PLAY ALL WEEK</text>
      ${footer("EXAM REPLAY", true)}
    `,
  });
}

async function feedThree() {
  await renderCard(path.join(OUT.feed3, "feed-3-page-02-arena.png"), {
    base: { dark: true },
    overlay: `
      ${pill("PLACEMENT DONE", 72, 158, { dark: true, width: 260 })}
      ${textBlock(["배치 끝.", "실버 2."], 72, 292, {
        size: 80, lineHeight: 92, fill: C.white,
      })}
      ${textBlock(["다음 주 랭킹전에 다시 도전."], 72, 508, {
        size: 25, fill: "#B8C2DF", weight: 650,
      })}

      <text x="972" y="886" fill="#FFFFFF08" font-family="${DISPLAY_FONT}"
        font-size="310" font-weight="400" text-anchor="end">S2</text>
      <polygon points="302,594 466,686 466,874 302,966 138,874 138,686"
        fill="url(#blueGlow)" filter="url(#shadow)"/>
      <polygon points="302,632 430,705 430,855 302,928 174,855 174,705"
        fill="#FFFFFF10" stroke="#FFFFFF45" stroke-width="3"/>
      <text x="302" y="756" fill="#C9D4FF" font-family="${MONO}"
        font-size="16" font-weight="850" text-anchor="middle"
        letter-spacing="2">SILVER</text>
      <text x="302" y="862" fill="${C.white}" font-family="${DISPLAY_FONT}"
        font-size="96" font-weight="400" text-anchor="middle">2</text>

      <rect x="538" y="660" width="470" height="238" rx="38"
        fill="#FFFFFF0D" stroke="#FFFFFF22"/>
      <text x="580" y="716" fill="#9EAFE0" font-family="${MONO}"
        font-size="15" font-weight="850">NEXT TIER</text>
      <text x="580" y="790" fill="${C.white}" font-family="${FONT}"
        font-size="34" font-weight="850">골드까지 248점</text>
      <rect x="580" y="830" width="372" height="18" rx="9"
        fill="#FFFFFF18"/>
      <rect x="580" y="830" width="228" height="18" rx="9"
        fill="${C.orange}"/>
      <circle cx="808" cy="839" r="13" fill="${C.white}"/>

      <rect x="72" y="1042" width="936" height="112" rx="32"
        fill="${C.blue}"/>
      <text x="116" y="1112" fill="${C.white}" font-family="${FONT}"
        font-size="27" font-weight="850">평일에 준비하고, 일요일에 티어 갱신 →</text>
      ${footer("WAR OF GOAT", true)}
    `,
  });

  await renderCard(path.join(OUT.feed3, "feed-3-page-03-ranking.png"), {
    base: { dark: true },
    overlay: `
      ${pill("RANKING CHECK", 72, 158, { dark: true, width: 245 })}
      ${textBlock(["전체 483위.", "우리 학교 12위."], 72, 292, {
        size: 70, lineHeight: 86, fill: C.white,
      })}
      ${textBlock(["전체·학교·고등학교·지역 랭킹."], 72, 504, {
        size: 24, fill: "#B8C2DF", weight: 650,
      })}

      <text x="1008" y="794" fill="#FFFFFF08" font-family="${DISPLAY_FONT}"
        font-size="250" font-weight="400" text-anchor="end">483</text>

      <g transform="rotate(-4 302 820)">
        <rect x="72" y="628" width="460" height="384" rx="44"
          fill="${C.white}" filter="url(#shadow)"/>
        <text x="118" y="700" fill="${C.blue}" font-family="${MONO}"
          font-size="16" font-weight="850" letter-spacing="2">NATIONAL</text>
        <text x="118" y="842" fill="${C.ink}" font-family="${DISPLAY_FONT}"
          font-size="104" font-weight="400">#483</text>
        <path d="M118 918 H450" stroke="#DDE2EF" stroke-width="2"/>
        <text x="118" y="966" fill="${C.muted}" font-family="${FONT}"
          font-size="22" font-weight="750">지난주보다 37계단 상승</text>
      </g>

      <g transform="rotate(4 778 810)">
        <rect x="570" y="612" width="416" height="396" rx="44"
          fill="url(#blueGlow)" filter="url(#shadow)"/>
        <text x="614" y="684" fill="#D8DEFF" font-family="${MONO}"
          font-size="16" font-weight="850" letter-spacing="2">MY SCHOOL</text>
        <text x="614" y="840" fill="${C.white}" font-family="${DISPLAY_FONT}"
          font-size="112" font-weight="400">#12</text>
        <path d="M614 916 H922" stroke="#FFFFFF30" stroke-width="2"/>
        <text x="614" y="966" fill="${C.white}" font-family="${FONT}"
          font-size="22" font-weight="750">TOP 3까지 29점</text>
      </g>

      ${chip("지역 #58", 72, 1080, 212, {
        fill: "#FFFFFF10", textFill: C.white, stroke: "#FFFFFF22",
      })}
      ${chip("고2 #23", 302, 1080, 212, {
        fill: "#FFFFFF10", textFill: C.white, stroke: "#FFFFFF22",
      })}
      ${footer("WAR OF GOAT", true)}
    `,
  });

  await renderCard(path.join(OUT.feed3, "feed-3-page-04-sunday.png"), {
    base: { dark: true },
    overlay: `
      ${pill("EVERY SUNDAY · KST", 72, 158, { dark: true, width: 310 })}
      ${textBlock(["일요일,", "세 번의 기회."], 72, 300, {
        size: 78, lineHeight: 92, fill: C.white,
      })}
      ${textBlock(["한 주 동안 준비한 걸 순위로 확인하는 날."], 72, 516, {
        size: 25, fill: "#B8C2DF", weight: 650,
      })}

      <rect x="72" y="626" width="936" height="158" rx="32"
        fill="#FFFFFF10" stroke="#FFFFFF20"/>
      <rect x="100" y="654" width="102" height="102" rx="28"
        fill="${C.blue}"/>
      <text x="151" y="716" fill="${C.white}" font-family="${FONT}"
        font-size="32" font-weight="850" text-anchor="middle">A</text>
      <text x="250" y="724" fill="${C.white}" font-family="${MONO}"
        font-size="42" font-weight="850">15:00 – 16:40</text>

      <rect x="72" y="808" width="936" height="158" rx="32"
        fill="#FFFFFF10" stroke="#FFFFFF20"/>
      <rect x="100" y="836" width="102" height="102" rx="28"
        fill="${C.violet}"/>
      <text x="151" y="898" fill="${C.white}" font-family="${FONT}"
        font-size="32" font-weight="850" text-anchor="middle">B</text>
      <text x="250" y="906" fill="${C.white}" font-family="${MONO}"
        font-size="42" font-weight="850">18:00 – 19:40</text>

      <rect x="72" y="990" width="936" height="158" rx="32"
        fill="#FFFFFF10" stroke="#FFFFFF20"/>
      <rect x="100" y="1018" width="102" height="102" rx="28"
        fill="${C.orange}"/>
      <text x="151" y="1080" fill="${C.white}" font-family="${FONT}"
        font-size="32" font-weight="850" text-anchor="middle">C</text>
      <text x="250" y="1088" fill="${C.white}" font-family="${MONO}"
        font-size="42" font-weight="850">21:00 – 22:40</text>
      ${footer("WAR OF GOAT", true)}
    `,
  });

  await renderCard(path.join(OUT.feed3, "feed-3-page-05-rank-switch.png"), {
    base: { dark: true },
    overlay: `
      ${pill("RANK SWITCH", 72, 158, { dark: true, width: 235 })}
      ${textBlock(["100위가 1위를", "직접 지목한다."], 72, 300, {
        size: 74, lineHeight: 88, fill: C.white,
      })}
      ${textBlock(["한 판으로 순위가 뒤집히는 랭킹 스위칭."], 72, 508, {
        size: 25, fill: "#B8C2DF", weight: 650,
      })}

      <rect x="72" y="606" width="392" height="250" rx="34"
        fill="#FFFFFF0D" stroke="#FFFFFF22"/>
      <text x="108" y="660" fill="#9DAEE0" font-family="${MONO}"
        font-size="15" font-weight="850" letter-spacing="1.8">DEFENDER</text>
      <text x="108" y="752" fill="${C.white}" font-family="${MONO}"
        font-size="72" font-weight="900">01</text>
      <text x="108" y="808" fill="#C7D0ED" font-family="${FONT}"
        font-size="24" font-weight="750">현재 1위</text>

      <circle cx="540" cy="731" r="54" fill="${C.coral}"/>
      <text x="540" y="743" fill="${C.white}" font-family="${MONO}"
        font-size="27" font-weight="900" text-anchor="middle">VS</text>

      <rect x="616" y="606" width="392" height="250" rx="34"
        fill="#FFFFFF0D" stroke="#FFFFFF22"/>
      <text x="652" y="660" fill="#B7A9FF" font-family="${MONO}"
        font-size="15" font-weight="850" letter-spacing="1.8">ATTACKER</text>
      <text x="652" y="752" fill="${C.white}" font-family="${MONO}"
        font-size="72" font-weight="900">100</text>
      <text x="652" y="808" fill="#C7D0ED" font-family="${FONT}"
        font-size="24" font-weight="750">대결권으로 지목</text>

      <rect x="72" y="892" width="936" height="120" rx="30"
        fill="${C.blue}"/>
      <text x="110" y="942" fill="#C9D4FF" font-family="${MONO}"
        font-size="14" font-weight="850" letter-spacing="1.6">도전자 승리</text>
      <text x="110" y="985" fill="${C.white}" font-family="${FONT}"
        font-size="28" font-weight="850">1위 ↔ 100위 즉시 교체</text>

      <rect x="72" y="1036" width="936" height="120" rx="30"
        fill="#FFFFFF0D" stroke="#FFFFFF22"/>
      <text x="110" y="1086" fill="#8DDBEC" font-family="${MONO}"
        font-size="14" font-weight="850" letter-spacing="1.6">1위 방어 성공</text>
      <text x="110" y="1129" fill="${C.white}" font-family="${FONT}"
        font-size="28" font-weight="850">순위 유지 + 방어 코인 지급</text>
      ${footer("WAR OF GOAT", true)}
    `,
  });

  const hero = await roundedImage(
    path.join(ASSETS, "challenge-hero.png"),
    680,
    1110,
    0,
    "cover",
    "right"
  );
  await renderCard(path.join(OUT.feed3, "feed-3-page-06-comeback.png"), {
    base: { dark: true },
    layers: [
      { input: hero, left: 400, top: 240 },
      {
        input: svg(
          W,
          H,
          `
          <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${C.navy}" stop-opacity="1"/>
            <stop offset="68%" stop-color="${C.navy}" stop-opacity=".74"/>
            <stop offset="100%" stop-color="${C.navy}" stop-opacity="0"/>
          </linearGradient>
          <rect x="0" y="160" width="820" height="1180" fill="url(#fade)"/>`
        ),
      },
    ],
    overlay: `
      ${pill("NEXT SUNDAY · COMEBACK", 72, 158, { dark: true, width: 345 })}
      ${textBlock(["다음 일요일,", "다시 랭킹전."], 72, 316, {
        size: 78, lineHeight: 92, fill: C.white,
      })}
      ${textBlock(["평일 기록을 모아", "다시 응시한다."], 72, 558, {
        size: 25, lineHeight: 38, fill: "#C2CBE5", weight: 650,
      })}
      <rect x="72" y="742" width="362" height="170" rx="30"
        fill="#FFFFFF10" stroke="#FFFFFF22"/>
      <text x="108" y="796" fill="#9DAEE0" font-family="${MONO}"
        font-size="15" font-weight="850">THIS WEEK</text>
      <text x="108" y="852" fill="${C.white}" font-family="${FONT}"
        font-size="30" font-weight="850">눈풀이 · 오답 · 리플레이</text>
      <rect x="72" y="956" width="300" height="82" rx="25"
        fill="${C.blue}"/>
      <text x="222" y="1008" fill="${C.white}" font-family="${FONT}"
        font-size="26" font-weight="850" text-anchor="middle">다시 전장으로 →</text>
      ${footer("WAR OF GOAT", true)}
    `,
  });
}

async function createPreviews() {
  const coverFiles = [
    path.join(OUT.feed1, "feed-1-page-01-cover.png"),
    path.join(OUT.feed2, "feed-2-page-01-cover.png"),
    path.join(OUT.feed3, "feed-3-page-01-cover.png"),
  ];
  const covers = await Promise.all(
    coverFiles.map((file) => sharp(file).resize(360, 480).toBuffer())
  );
  await sharp({
    create: {
      width: 1080,
      height: 480,
      channels: 3,
      background: "#FFFFFF",
    },
  })
    .composite(
      covers.map((input, index) => ({
        input,
        left: index * 360,
        top: 0,
      }))
    )
    .png()
    .toFile(path.join(OUT.preview, "pinned-row-preview.png"));

  const groups = [OUT.feed1, OUT.feed2, OUT.feed3].map((dir) =>
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".png"))
      .sort()
      .map((file) => path.join(dir, file))
  );
  const thumbs = await Promise.all(
    groups.map((files) =>
      Promise.all(files.map((file) => sharp(file).resize(270, 360).toBuffer()))
    )
  );
  const maxPages = Math.max(...thumbs.map((group) => group.length));
  const layers = thumbs.flatMap((group, feed) =>
    group.map((input, page) => ({
      input,
      left: 20 + feed * 285,
      top: 20 + page * 380,
    }))
  );
  await sharp({
    create: {
      width: 870,
      height: maxPages * 380 + 40,
      channels: 3,
      background: C.paper,
    },
  })
    .composite(layers)
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toFile(path.join(OUT.preview, "all-17-cards-contact-sheet.jpg"));
}

async function main() {
  [OUT.feed1, OUT.feed2, OUT.feed3].forEach((dir) => {
    fs.readdirSync(dir)
      .filter((file) => file.endsWith(".png"))
      .forEach((file) => fs.unlinkSync(path.join(dir, file)));
  });
  fs.readdirSync(OUT.preview)
    .filter((file) => file.startsWith("all-") && file.endsWith(".jpg"))
    .forEach((file) => fs.unlinkSync(path.join(OUT.preview, file)));
  await prepareBrandMark();
  await createCovers();
  await feedOne();
  await feedTwo();
  await feedThree();
  await createPreviews();
  console.log("Created 17 entertainment-first Instagram cards.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
