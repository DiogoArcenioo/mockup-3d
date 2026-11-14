export function MerchArt() {
  return <svg className="merch-art" viewBox="0 0 600 390" fill="none" aria-hidden="true">
    <defs>
      <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0v30" stroke="#fff" strokeOpacity=".055" /></pattern>
      <linearGradient id="ceramic" x1="100" y1="100" x2="300" y2="280" gradientUnits="userSpaceOnUse"><stop stopColor="white" /><stop offset="1" stopColor="#bcbcbc" /></linearGradient>
      <linearGradient id="shirt" x1="300" y1="30" x2="510" y2="250" gradientUnits="userSpaceOnUse"><stop stopColor="#e8e8e8" /><stop offset="1" stopColor="#a8a8a8" /></linearGradient>
      <filter id="shadow"><feGaussianBlur stdDeviation="12" /></filter>
    </defs>
    <rect width="600" height="390" fill="url(#grid)" />
    <ellipse cx="290" cy="332" rx="211" ry="16" fill="black" opacity=".4" filter="url(#shadow)" />
    <g transform="translate(309 33) rotate(12 110 120)">
      <path d="m66 18-52 34 25 53 30-14v167h129V91l30 14 25-53-52-34-35-10H101L66 18Z" fill="url(#shirt)" stroke="#eee" strokeWidth="2" />
      <path d="M101 8c3 35 61 35 65 0" stroke="#777" strokeWidth="7" />
      <path d="M72 91 68 48m128 43 5-43" stroke="#a0a0a0" strokeWidth="2" />
      <path d="m110 116 21-21 21 21-21 21-21-21Z" fill="#272727" /><text x="131" y="164" fill="#333" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="18" letterSpacing="3">CREATE</text>
      <path d="M80 245h107" stroke="#999" />
    </g>
    <g transform="translate(75 105) rotate(-10 110 95)">
      <path d="M172 42h26c44 0 44 78 0 78h-26v-20h22c20 0 20-37 0-37h-22V42Z" fill="#c8c8c8" stroke="#eee" strokeWidth="2" />
      <path d="M23 27h155v153c0 41-155 41-155 0V27Z" fill="url(#ceramic)" />
      <ellipse cx="100.5" cy="27" rx="77.5" ry="20" fill="#efefef" /><ellipse cx="100.5" cy="27" rx="65" ry="12" fill="#3a3a3a" /><path d="M37 48v117" stroke="white" strokeWidth="7" strokeOpacity=".55" strokeLinecap="round" />
      <text x="100" y="115" fill="#202020" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="24" letterSpacing="-1">make</text><text x="100" y="141" fill="#202020" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="24" letterSpacing="-1">it yours.</text>
    </g>
    <g transform="translate(314 205) rotate(-16 40 70)">
      <rect width="80" height="143" rx="16" fill="#353535" stroke="#999" strokeWidth="2" /><rect x="5" y="5" width="70" height="133" rx="12" fill="#242424" />
      <rect x="11" y="11" width="28" height="31" rx="8" fill="#444" /><circle cx="20" cy="21" r="6" fill="#151515" stroke="#777" /><circle cx="30" cy="32" r="6" fill="#151515" stroke="#777" />
      <path d="m29 90 12-17 12 17-12 17-12-17Z" fill="white" />
    </g>
    <path d="m78 46 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Zm447 231 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z" fill="white" />
    <circle cx="264" cy="59" r="4" stroke="#9a9a9a" /><path d="m50 281 5 5m0-5-5 5m509-173 5 5m0-5-5 5" stroke="#888" strokeWidth="2" />
  </svg>;
}
