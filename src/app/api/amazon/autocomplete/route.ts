import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("q") || "";
    const marketplace = searchParams.get("marketplace") || "Amazon India";

    if (!keyword) {
      return NextResponse.json({ suggestions: [] });
    }

    // 1. Resolve host and mid based on marketplace
    let host = "completion.amazon.in";
    let mid = "A21TJRUUN4KGV"; // India
    let lop = "en_IN";

    const normMkt = marketplace.toLowerCase();
    if (normMkt.includes("us") || normMkt.includes("com") || normMkt.includes("america")) {
      host = "completion.amazon.com";
      mid = "ATVPDKIKX0DER"; // US
      lop = "en_US";
    } else if (normMkt.includes("uk") || normMkt.includes("united kingdom") || normMkt.includes("co.uk") || normMkt.includes("europe")) {
      host = "completion.amazon.co.uk";
      mid = "A1F83G8C2ARO7P"; // UK
      lop = "en_GB";
    } else if (normMkt.includes("japan") || normMkt.includes("jp") || normMkt.includes("east")) {
      host = "completion.amazon.co.jp";
      mid = "A1VC38T7YXB528"; // Japan
      lop = "ja_JP";
    }

    const url = `https://${host}/api/2017/suggestions?session-id=133-8255278-6511363&customer-id=&request-id=&page-type=Search&lop=${lop}&site-variant=desktop&client-info=amazon-search-ui&mid=${mid}&alias=aps&b2b=0&fresh=0&ks=65&prefix=${encodeURIComponent(keyword)}&event=onKeyPress&limit=11&fb=1&suggestion-type=KEYWORD`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Autocomplete fetch failed:", errText);
      return NextResponse.json({ error: "Failed to fetch suggestions from Amazon" }, { status: res.status });
    }

    const data = await res.json();
    const suggestions = data.suggestions?.map((s: any) => s.value) || [];

    return NextResponse.json({ suggestions });

  } catch (error: any) {
    console.error("Autocomplete fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
