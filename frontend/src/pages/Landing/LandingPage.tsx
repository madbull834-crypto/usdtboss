import { useEffect } from "react";



const CSS_FILES = [
  "/web_assets/css/bootstrap.min.css",
  "/web_assets/css/owl.carousel.min.css",
  "/web_assets/css/owl.theme.default.min.css",
  "/web_assets/css/animate.css",
  "/web_assets/css/animated-text.css",
  "/web_assets/css/all.min.css",
  "/web_assets/css/flaticon.css",
  "/web_assets/css/theme-default.css",
  "/web_assets/css/meanmenu.min.css",
  "/web_assets/style.css",
  "/web_assets/venobox/venobox.css",
  "/web_assets/css/responsive.css",
];


const SECTION_FIX_CSS = `
  /* =========================================================
     USDT Boss React section separation fix
     Hero and Features are two independent sections.
     This overrides legacy template/particle positioning only.
     ========================================================= */

  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    overflow-x: hidden;
  }

  #root {
    width: 100%;
    overflow-x: hidden;
  }

  .usdtboss-page {
    position: relative;
    width: 100%;
    overflow-x: hidden;
    background: #000;
  }

  /* HERO: keep the particle layer inside the first section */
  .usdtboss-hero {
    position: relative;
    display: block;
    width: 100%;
    min-height: 780px;
    overflow: hidden;
    clear: both;
    isolation: isolate;
  }

  .usdtboss-hero #particles {
    position: relative !important;
    width: 100%;
    min-height: 780px;
    height: 780px !important;
    overflow: hidden;
    z-index: 0;
  }

  .usdtboss-hero #webcoderskull {
    position: relative;
    width: 100%;
    min-height: 780px;
    height: 780px;
    overflow: hidden;
  }

  .usdtboss-hero .hero-section {
    position: relative;
    min-height: 780px;
    height: 780px;
    z-index: 2;
  }

  /* Do not let the particle canvas cover the next section */
  .usdtboss-hero #particles > canvas,
  .usdtboss-hero #webcoderskull > canvas {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    z-index: 0 !important;
    pointer-events: none;
  }

  /* FEATURES: always starts after the complete hero */
  .usdtboss-features {
    position: relative !important;
    display: block !important;
    width: 100%;
    min-height: 520px;
    height: auto !important;
    clear: both !important;
    overflow: hidden;
    z-index: 10;
    background: #0d0d0d;
    isolation: isolate;
  }

  .usdtboss-features .container {
    position: relative;
    z-index: 2;
  }

  /* Prevent legacy absolute/floating rules from pulling the
     feature title/cards into the hero. */
  .usdtboss-features .row {
    position: relative;
    clear: both;
  }

  @media (max-width: 991px) {
    .usdtboss-hero,
    .usdtboss-hero #particles,
    .usdtboss-hero #webcoderskull,
    .usdtboss-hero .hero-section {
      min-height: 900px;
      height: 900px !important;
    }

    .usdtboss-features {
      min-height: 700px;
    }
  }

  @media (max-width: 575px) {
    .usdtboss-hero,
    .usdtboss-hero #particles,
    .usdtboss-hero #webcoderskull,
    .usdtboss-hero .hero-section {
      min-height: 920px;
      height: 920px !important;
    }
  }
`;

const JS_FILES = [
 "/web_assets/js/jquery.min.js",
 "/web_assets/js/bootstrap.min.js",
 "/web_assets/js/owl.carousel.min.js",
 "/web_assets/js/waypoints.min.js",
 "/web_assets/js/wow.js",
 "/web_assets/js/imagesloaded.pkgd.min.js",
 "/web_assets/venobox/venobox.min.js",
 "/web_assets/js/animated-text.js",
 "/web_assets/js/jquery.meanmenu.js",
 "/web_assets/js/jquery.scrollUp.js",
 "/web_assets/js/jquery.barfiller.js",
 "/web_assets/js/main.js",
 "/web_assets/js/theme.js",
 "/web_assets/js/range.js",
 "/web_assets/js/particls.chart1.js",
];

export default function LandingPage() {


  useEffect(() => {
    document.title = "USDT Boss | USDT Trading Platform";

    const sectionFixStyle = document.createElement("style");
    sectionFixStyle.setAttribute("data-usdtboss-section-fix", "true");
    sectionFixStyle.textContent = SECTION_FIX_CSS;
    document.head.appendChild(sectionFixStyle);


    const addedLinks: HTMLLinkElement[] = [];

    CSS_FILES.forEach((href) => {
      if (document.querySelector(`link[data-usdtboss-css="${href}"]`)) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.usdtbossCss = href;
      document.head.appendChild(link);
      addedLinks.push(link);
    });

    let cancelled = false;

    const loadScripts = async () => {
      for (const src of JS_FILES) {
        if (cancelled) return;

        if (document.querySelector(`script[data-usdtboss-js="${src}"]`)) {
          continue;
        }

        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = src;
          script.async = false;
          script.dataset.usdtbossJs = src;
          script.onload = () => resolve();
          script.onerror = () => resolve();
          document.body.appendChild(script);
        });
      }
    };

    loadScripts();

    return () => {
      cancelled = true;
      // CSS/JS are intentionally kept loaded because the legacy theme
      // plugins can be required by other pages of the application.
    };
  }, []);

  const goLogin = () => window.location.assign("/login" + window.location.search);

  const goRegister = () => window.location.assign("/register" + window.location.search);

  return (
    <div
      className="usdtboss-page"
      style={{
        minHeight: "100vh",
        background: "black",
        color: "#fff",
        overflowX: "hidden",
      }}
    >
    {/* loder */}
    <div className="loader-wrapper">
      <div className="loader"></div>
      <div className="loder-section left-section"></div>
      <div className="loder-section right-section"></div>
    </div>
    {/* ================================================== */}
    {/* Start USDT Boss Main Menu Area */}
    {/* ================================================== */}
    <div id="sticky-header" className="cryptobit_nav_manu upper">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-4">
            <div className="logo">
              <a className="upper1" href="#home" title="USDT Boss">
                <img src="/web_assets/logo.png" alt="USDT Boss USDT" style={{ height: "100px", width: "auto" }} />
              </a>
              <a className="main_sticky upper1" href="#home" title="USDT Boss">
                <img src="/web_assets/logo.png" alt="USDT Boss" style={{ height: "100px", width: "auto" }} />
              </a>
            </div>
          </div>
          <div className="col-lg-8">
            <nav className="cryptobit_menu upper">
              <ul className="nav_scroll">
                <li>
                  <a href="#home">Home</a>
                </li>
                <li>
                  <a href="#about">About</a>
                </li>
                <li>
                  <a href="#service">Services</a>
                </li>
                <li>
                  <a href="#contact">Contact</a>
                </li>
              </ul>
             <div className="header-button upper1">
                  <a
                    href={"/login" + window.location.search}
                    onClick={(e) => {
                      e.preventDefault();
                      goLogin();
                    }}
                  >
                    Login
                  </a>
                </div>
                
                <div className="header-button upper1">
                  <a
                    href={"/register" + window.location.search}
                    onClick={(e) => {
                      e.preventDefault();
                      goRegister();
                    }}
                  >
                    Register
                  </a>
                </div>

            </nav>
          </div>
        </div>
      </div>
    </div>
    {/* USDT Boss Mobile Menu Area */}
    <div className="mobile-menu-area d-sm-block d-md-block d-lg-none">
      <div className="mobile-menu">
        <nav className="cripto_menu">
          <ul className="nav_scroll">
            <li>
              <a href="#home">Home</a>
            </li>
            <li>
              <a href="#about">About USDT</a>
            </li>
            <li>
              <a href="#service">USDT Services</a>
            </li>
            <li>
              <a href="#contact">Contact</a>
            </li>
            <li>
              <a href="/login" onClick={(e) => { e.preventDefault(); goLogin(); }}>Login</a>
            </li>
          </ul>
        </nav>
      </div>
    </div>
    {/* ================================================== */}
    {/* End USDT Boss main menu Area */}
    {/* ================================================== */}
    {/* ============================================================== */}
    {/* Start -particles- Section - USDT Hero */}
    {/* ============================================================= */}
    <div className="clearfix" style={{ clear: "both" }}></div>
    <section className="usdtboss-hero" aria-label="USDT Boss hero">
      <div id="particles">
        <div id="webcoderskull">
          <div className="hero-section style-two upper d-flex align-items-center" id="home">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-lg-6 col-md-6 col-sm-12">
                <div className="hero-content wow fadeInDown" data-wow-delay=".3">
                  <div className="hero-title">
                    <h1>Experience of</h1>
                    <h1>USDT Stable Transfers</h1>
                    <h3>Powered by BEP20</h3>
                    <div className="shape"></div>
                  </div>
                  <div className="hero-text">
                    <p>
                      USDT Boss enables seamless USDT transactions,
                      <br />
                      with full transparency, low fees and real-time settlement on blockchain.
                    </p>
                  </div>
                 <div className="hero-button">
                      <a
                        href="/login"
                        onClick={(e) => {
                          e.preventDefault();
                          goLogin();
                        }}
                      >
                        Login
                      </a>
                    
                      <a
                        href="/view-login"
                        onClick={(e) => {
                          e.preventDefault();
                          goRegister();
                        }}
                      >
                        Register
                      </a>
                    </div>

                </div>
                <div className="dreamit-hero-thumb">
                  <div className="hero-thumb-inner4 bounce-animate4">
                    <img src="/web_assets/images/slider/half-circle.png" alt="" />
                  </div>
                  <div className="hero-thumb-inner5 bounce-animate">
                    <img src="/web_assets/images/slider/cross-2.png" alt="" />
                  </div>
                  <div className="hero-thumb-inner6 bounce-animate2">
                    <img src="/web_assets/images/slider/cross.png" alt="" />
                  </div>
                </div>
              </div>
              <div className="col-lg-6 col-md-6 col-sm-12">
                <div className="dreamit-hero-thumb wow fadeInDown" data-wow-delay=".">
                  <div className="hero-main-thumb">
                    <img src="/web_assets/images/slider/main-img.png" alt="USDT Crypto" />
                  </div>
                  <div className="hero-thumb-inner1 rotateme">
                    <img src="/web_assets/images/slider/round.png" alt="" />
                  </div>
                  <div className="hero-thumb-inner2 bounce-animate">
                    <img src="/web_assets/images/slider/style-1.png" alt="" />
                  </div>
                  <div className="hero-thumb-inner3 bounce-animate3">
                    <img src="/web_assets/images/slider/style-2.png" alt="" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
    <div className="clearfix" style={{ clear: "both" }}></div>
    {/* ================================================== */}
    {/* Start USDT Boss Feature Area */}
    {/* ================================================== */}
    <section className="feature-area style-two pt-90 pb-80 usdtboss-features" id="feature">
      <div className="container">
        <div className="row">
          <div className="col-lg-12 col-sm-12">
            <div className="dreamit-section-title style-two text-center pb-65">
              <h4>USDT Boss FEATURES</h4>
              <h1>The most trusted way for</h1>
              <h1>USDT Transactions & Liquidity</h1>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-lg-4 col-md-6 col-sm-12">
            <div className="feature-single-box wow fadeInLeft" data-wow-delay=".3s">
              <div className="feature-box-inner">
                <div className="feature-icon1">
                  <i className="flaticon flaticon-layers restly-flaticon"></i>
                </div>
                <div className="feature-title">
                  <h3>Full USDT Transparency</h3>
                  <p>Every USDT transfer is recorded on immutable blockchain ledger.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-4 col-md-6 col-sm-12">
            <div className="feature-single-box upper1 wow fadeInLeft" data-wow-delay=".4s">
              <div className="feature-box-inner">
                <div className="feature-icon1">
                  <i className="flaticon-file"></i>
                </div>
                <div className="feature-title">
                  <h3>USDT Fast Settlement</h3>
                  <p>Send and receive USDT in seconds with minimal network fees.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-4 col-md-6 col-sm-12">
            <div className="feature-single-box upper2 wow fadeInLeft" data-wow-delay=".5s">
              <div className="feature-box-inner">
                <div className="feature-icon1">
                  <i className="flaticon flaticon-shield-1 restly-flaticon"></i>
                </div>
                <div className="feature-title">
                  <h3>High Security for USDT</h3>
                  <p>Enterprise-grade custody and secure smart contract protocols.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    {/* ================================================== */}
    {/* End USDT Boss feature Area */}
    {/* ================================================== */}
    {/* ================================================== */}
    {/* Start USDT Boss about Area | USDT Focus */}
    {/* ================================================== */}
    <div className="about-area style-two pt-100 pb-100" id="about">
      <div className="container">
        <div className="row">
          <div className="col-lg-6 col-md-6 col-sm-12">
            <div className="dreamit-about-thumb wow fadeInLeft" data-wow-delay=".3s">
              <img src="/web_assets/images/resource/about-main-img.png" alt="USDT blockchain" />
              <div className="about-thumb-inner rotateme">
                <img src="/web_assets/images/resource/about-coin.png" alt="USDT token" />
              </div>
              <div className="about-thumb-inner1 bounce-animate3">
                <img src="/web_assets/images/resource/about-icon.png" alt="" />
              </div>
            </div>
          </div>
          <div className="col-lg-6 col-md-6 col-sm-12">
            <div className="row wow fadeInLeft" data-wow-delay=".4s">
              <div className="col-lg-12">
                <div className="dreamit-section-title style-two pb-2">
                  <h4>USDT TRANSACTIONS</h4>
                  <h1>USDT Boss records every</h1>
                  <h1>USDT transfer on Blockchain</h1>
                  <p className="section-text">USDT Boss enhances B2C USDT transfers with next-generation stablecoin infrastructure. Energistically facilitate cross-border USDT payments and asset settlements with real-time auditability and low-cost transfers.</p>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="about-single-icon-box wow fadeInLeft" data-wow-delay=".5s">
                  <div className="about-icon">
                    <i className="flaticon-light-bulb"></i>
                  </div>
                  <div className="about-title">
                    <h4>USDT Exchange Value</h4>
                  </div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="about-single-icon-box wow fadeInLeft" data-wow-delay=".6s">
                  <div className="about-icon">
                    <i className="flaticon-support-3"></i>
                  </div>
                  <div className="about-title">
                    <h4>USDT Wallet Security</h4>
                  </div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="about-single-icon-box wow fadeInLeft" data-wow-delay=".7s">
                  <div className="about-icon">
                    <i className="flaticon-hand-shake"></i>
                  </div>
                  <div className="about-title">
                    <h4>USDT Dashboard</h4>
                  </div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="about-single-icon-box wow fadeInLeft" data-wow-delay=".8s">
                  <div className="about-icon">
                    <i className="flaticon-time-3"></i>
                  </div>
                  <div className="about-title">
                    <h4>USDT Asset Registry</h4>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* ================================================== */}
    {/* End USDT Boss about Area */}
    {/* ================================================== */}
    {/* ================================================== */}
    {/* Start USDT Boss Services focused on USDT */}
    {/* ================================================== */}
    <div className="services-area style-two pt-90 pb-100" id="service">
      <div className="container">
        <div className="row">
          <div className="col-lg-12 col-sm-12">
            <div className="dreamit-section-title text-center style-two pb-5 wow fadeInLeft" data-wow-delay=".3s">
              <h4>USDT Boss SERVICE</h4>
              <h1>The Heart of the Stablecoin</h1>
              <h1>USDT Value Chain</h1>
              <p className="section-text">USDT Boss provides fastest USDT settlement, institutional liquidity and defi-ready infrastructure.</p>
            </div>
          </div>
        </div>
        <div className="row service-bg wow fadeInLeft" data-wow-delay=".5s">
          <div className="col-lg-6 col-md-6 col-sm-12">
            <div className="dreamit-section-title style-two">
              <h1>USDT Boss will</h1>
              <h1>Record Every USDT</h1>
              <h1>Transaction & Mint</h1>
              <p className="service-text">USDT Boss delivers next-gen USDT transfers and programmable settlements. Uniquely orchestrate cross-chain USDT flows while maintaining 1:1 USD peg reliability.</p>
            </div>
            <div className="about-button2">
              <a href="/register" onClick={(e) => { e.preventDefault(); goRegister(); }}>Register</a>
            </div>
          </div>
          <div className="col-lg-6 col-md-6 col-sm-12">
            <div className="service-single-thumb wow fadeInLeft" data-wow-delay=".6s">
              <div className="service-main-thumb">
                <img src="/web_assets/images/resource/mobile-img.png" alt="USDT mobile app" />
              </div>
              <div className="service-thumb-inner bounce-animate3">
                <img src="/web_assets/images/resource/coin.png" alt="USDT coin" />
              </div>
              <div className="service-thumb-inner1 bounce-animate4">
                <img src="/web_assets/images/resource/half-circle-red.png" alt="" />
              </div>
              <div className="service-thumb-inner2 bounce-animate5">
                <img src="/web_assets/images/resource/half-cirlce-green.png" alt="" />
              </div>
              <div className="service-thumb-inner3 bounce-animate">
                <img src="/web_assets/images/resource/crosss-icon.png" alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* ================================================== */}
    {/* End USDT Boss Services Area */}
    {/* ================================================== */}
    {/* ================================================== */}
    {/* Start USDT Boss process Area | USDT Flow */}
    {/* ================================================== */}
    <div className="process-area pt-80 pb-70" id="process">
      <div className="container">
        <div className="row">
          <div className="col-lg-12 col-sm-12">
            <div className="dreamit-section-title text-center style-two pb-5 wow fadeInLeft" data-wow-delay=".3s">
              <h4>USDT WORK PROCESS</h4>
              <h1>USDT Boss Workflow</h1>
              <p className="section-text">Simple and secure process to transfer, store and utilize USDT across global markets.</p>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-lg-12">
            <div className="row process-bg">
              <div className="col-lg-3 col-md-6">
                <div className="single-process-box wow fadeInLeft" data-wow-delay=".4s">
                  <div className="single-process-thumb">
                    <img src="/web_assets/images/resource/process1.png" alt="" />
                    <div className="process-number">
                      <span>01</span>
                    </div>
                  </div>
                  <div className="single-process-content">
                    <div className="process-title">
                      <h4>Get USDT Wallet</h4>
                    </div>
                    <div className="process-text">
                      <p>Create your USDT Boss wallet on TRC20/ERC20.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-lg-3 col-md-6">
                <div className="single-process-box wow fadeInLeft" data-wow-delay=".5s">
                  <div className="single-process-thumb">
                    <img src="/web_assets/images/resource/process2.png" alt="" />
                    <div className="process-number">
                      <span>02</span>
                    </div>
                  </div>
                  <div className="single-process-content">
                    <div className="process-title">
                      <h4>Deposit USDT</h4>
                    </div>
                    <div className="process-text">
                      <p>Fund your account with USDT from any external wallet.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-lg-3 col-md-6">
                <div className="single-process-box wow fadeInLeft" data-wow-delay=".6s">
                  <div className="single-process-thumb">
                    <img src="/web_assets/images/resource/process3.png" alt="" />
                    <div className="process-number">
                      <span>03</span>
                    </div>
                  </div>
                  <div className="single-process-content">
                    <div className="process-title">
                      <h4>Trade/Swap USDT</h4>
                    </div>
                    <div className="process-text">
                      <p>Convert, send or swap USDT with ultra-low fees.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-lg-3 col-md-6">
                <div className="single-process-box wow fadeInLeft" data-wow-delay=".6s">
                  <div className="single-process-thumb">
                    <img src="/web_assets/images/resource/process4.png" alt="" />
                    <div className="process-number">
                      <span>04</span>
                    </div>
                  </div>
                  <div className="single-process-content">
                    <div className="process-title">
                      <h4>USDT Membership</h4>
                    </div>
                    <div className="process-text">
                      <p>Upgrade for premium USDT staking and rewards.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* ================================================== */}
    {/* End USDT Boss process Area */}
    {/* ================================================== */}
    {/* ================================================== */}
    {/* Start USDT Boss testimonial Area | USDT Users */}
    {/* ================================================== */}
    <div className="testimonial-area pt-100 pb-70" id="testimonial">
      <div className="container">
        <div className="row wow fadeInLeft" data-wow-delay=".3s">
          <div className="col-lg-6 col-md-6">
            <div className="dreamit-section-title style-two pb-5">
              <h4>USDT TRADER STORIES</h4>
              <h1>USDT Boss Clients</h1>
              <h1>Testimonials on USDT</h1>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-lg-3 col-md-6">
            <div className="testimonial-counter-thumb wow fadeInLeft" data-wow-delay=".4s">
              <div className="counter-thumb">
                <img src="/web_assets/images/resource/testi.png" alt="" />
              </div>
              <div className="testimonial-counter-title">
                <h3 className="counter">
                  4820
                  <span>+</span>
                </h3>
                <p>Active USDT traders satisfied</p>
              </div>
            </div>
          </div>
          <div className="col-lg-9 col-md-6">
            <div className="row wow fadeInLeft" data-wow-delay=".5s">
              <div className="testimonial_list owl-carousel">
                <div className="col-lg-12">
                  <div className="testimonial-single-box">
                    <div className="testimonial-thumb">
                      <img src="/web_assets/images/resource/testi1.png" alt="" />
                    </div>
                    <div className="testimonial-content">
                      <div className="testimonial-title">
                        <h3>Linda M.</h3>
                      </div>
                      <div className="testi-icon">
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                      </div>
                      <div className="testimonial-text">
                        <p>USDT Trader since 2023</p>
                      </div>
                    </div>
                    <div className="qoute-icon">
                      <i className="fas fa-quote-right"></i>
                    </div>
                    <div className="testi-text">
                      <p>USDT Boss transformed my USDT experience. Fast transfers, no hidden fees and real-time settlement. As a frequent cross-border trader, using USDT on this platform saved me thousands in fees. Highly recommend!</p>
                    </div>
                  </div>
                </div>
                <div className="col-lg-12">
                  <div className="testimonial-single-box">
                    <div className="testimonial-thumb">
                      <img src="/web_assets/images/resource/testi1.png" alt="" />
                    </div>
                    <div className="testimonial-content">
                      <div className="testimonial-title">
                        <h3>Marcus Chen</h3>
                      </div>
                      <div className="testi-icon">
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star-half-alt"></i>
                      </div>
                      <div className="testimonial-text">
                        <p>USDT Institutional</p>
                      </div>
                    </div>
                    <div className="qoute-icon">
                      <i className="fas fa-quote-right"></i>
                    </div>
                    <div className="testi-text">
                      <p>Best USDT platform for stable settlements. TaitanUSDT’s blockchain audit trail gives full transparency. Withdrawals in USDT are instant and secure. Great liquidity and support for TRC20 and BEP20 USDT.</p>
                    </div>
                  </div>
                </div>
                <div className="col-lg-12">
                  <div className="testimonial-single-box">
                    <div className="testimonial-thumb">
                      <img src="/web_assets/images/resource/testi1.png" alt="" />
                    </div>
                    <div className="testimonial-content">
                      <div className="testimonial-title">
                        <h3>Sophia R.</h3>
                      </div>
                      <div className="testi-icon">
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                        <i className="fas fa-star"></i>
                      </div>
                      <div className="testimonial-text">
                        <p>USDT Holder</p>
                      </div>
                    </div>
                    <div className="qoute-icon">
                      <i className="fas fa-quote-right"></i>
                    </div>
                    <div className="testi-text">
                      <p>The dashboard makes on-chain activity easier to follow from one place.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* ================================================== */}
    {/* End USDT Boss testimonial Area */}
    {/* ================================================== */}
    {/* ===============//faq section - USDT specific \\================= */}
    <div className="faq-area style-two pt-100">
      <div className="container">
        <div className="row">
          <div className="col-lg-12">
            <div className="dreamit-section-title style-two pb-2 wow fadeInLeft" data-wow-delay=".3s">
              <h4>USDT FAQ</h4>
              <h1>Frequently asked about USDT</h1>
              <p className="section-text">Everything about stablecoin transfers, USDT wallets, and usdtboss.live secure infrastructure.</p>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-lg-6 col-md-6 col-sm-12">
            <div className="accordion-menu wow fadeInLeft" data-wow-delay=".5s">
              <ul className="accordion">
                <li>
                  <a>What is USDT and how does USDT Boss use it?</a>
                  <p>USDT is a stablecoin pegged 1:1 to USD. USDT Boss uses USDT for fast settlements, cross-border payments and as a settlement layer all recorded on public blockchain. You can deposit, withdraw and trade USDT seamlessly.</p>
                </li>
                <li>
                  <a>Can I send USDT to any external wallet?</a>
                  <p>The application currently operates with BEP20 USDT on BNB Smart Chain. Always verify the network and destination before signing.</p>
                </li>
                <li>
                  <a>How to create a USDT wallet on USDT Boss?</a>
                  <p>Connect a compatible self-custody EVM wallet. The application does not create or custody wallets.</p>
                </li>
              </ul>
            </div>
          </div>
          <div className="col-lg-6 col-md-6 col-sm-12">
            <div className="faq-single-thumb wow fadeInLeft" data-wow-delay=".6s">
              <img src="/web_assets/images/resource/faq1.png" alt="USDT faq" />
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* ===============//faq section end \\=================== */}
    {/* ===============//subscribe area for USDT updates \\=================== */}
    {/* <div class="subscribe-area pt-100 pb-100" id="contact"> */}
    {/* <div class="container"> */}
    {/* <div class="row"> */}
    {/* <div class="col-lg-12"> */}
    {/* <div class="single-subscribe-box wow fadeInLeft" data-wow-delay=".3s"> */}
    {/* <div class="subscribe-title text-center"> */}
    {/* <h1>Stay updated on USDT trends & news</h1> */}
    {/* <p> */}
    {/* Receive latest insights on stablecoin adoption, USDT market cap and exclusive offers from USDT Boss. */}
    {/* </p> */}
    {/* </div> */}
    {/* <div class="contact-form-box-2 text-center wow fadeInLeft" data-wow-delay=".4s"> */}
    {/* <form action="https://formspree.io/f/myyleorq" method="POST" id="dreamit-form"> */}
    {/* <div class="from-box2"> */}
    {/* <input type="text" name="E-Mail" placeholder="Enter Your E-Mail for USDT updates" /> */}
    {/* <button type="submit">Subscribe</button> */}
    {/* </div> */}
    {/* </form> */}
    {/* <div id="status"></div> */}
    {/* </div> */}
    {/* </div> */}
    {/* </div> */}
    {/* </div> */}
    {/* </div> */}
    {/* </div> */}
    {/* subscribe end */}
    {/* ================================================== */}
    {/* Start USDT Boss Footer Area */}
    {/* ================================================== */}
    <div className="footer-middle style-two pt-80 pb-3">
      <div className="container">
        <div className="row">
          <div className="col-lg-3 col-md-6">
            <div className="widgets-company-info pt-3 wow fadeInLeft" data-wow-delay=".4s">
              <div className="cryptobit-logo">
                <a className="logo_img" href="#home" title="USDT Boss">
                  <img src="/web_assets/logo.png" alt="USDT Boss" style={{ height: "150px", width: "auto" }} />
                </a>
              </div>
              <div className="company-info-desc">
                <p>USDT Boss displays public BNB Smart Chain activity and lets users submit contract transactions from their own wallets.</p>
              </div>
              <div className="company_icon">
                <a className="facebook" href="#">
                  <i className="fab fa-facebook-f"></i>
                </a>
                <a className="twitter" href="#">
                  <i className="fa-brands fa-x-twitter"></i>
                </a>
                <a className="linkedin" href="#">
                  <i className="fab fa-linkedin-in"></i>
                </a>
                <a className="pinterest" href="#">
                  <i className="fab fa-pinterest-p"></i>
                </a>
              </div>
            </div>
          </div>
          <div className="col-lg-9 col-md-6">
            <div className="row">
              <div className="col-lg-4 col-md-6">
                <div className="widget-nav-menu wow fadeInLeft" data-wow-delay=".5s">
                  <h4 className="widget-title">USDT Resources</h4>
                  <div className="menu-quick-link-content">
                    <ul className="menu">
                      <li>
                        <a href="#">What is USDT</a>
                      </li>
                      <li>
                        <a href="#">USDT TRC20</a>
                      </li>
                      <li>
                        <a href="#">USDT Roadmap</a>
                      </li>
                      <li>
                        <a href="#">USDT Advisors</a>
                      </li>
                      <li>
                        <a href="#">USDT Payments</a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="col-lg-4 col-md-6">
                <div className="widget-nav-menu upper wow fadeInLeft" data-wow-delay=".6s">
                  <h4 className="widget-title">Useful Links</h4>
                  <div className="menu-quick-link-content">
                    <ul className="menu">
                      <li>
                        <a href="#home">Home</a>
                      </li>
                      <li>
                        <a href="#about">About Us</a>
                      </li>
                      <li>
                        <a href="#service">Services</a>
                      </li>
                      <li>
                        <a href="#contact">Contact Us</a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="widget-nav-menu upper1 wow fadeInLeft" data-wow-delay=".7s">
                  <h4 className="widget-title">Contact Us</h4>
                  <div className="menu-quick-link">
                    {/* <p>Phone: +91 9876543210</p> */}
                    <p>Email: info@usdtboss.live</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="row footer-bottom mt-65 wow fadeInLeft" data-wow-delay=".8s">
          <div className="col-lg-4 col-md-6 col-sm-12">
            <div className="footer-bottom-content">
              <div className="footer-bottom-content-copy">
                <p>
                  © USDT Boss all Rights Reserved. USDT Platform by
                  <span>usdtboss.live</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* ================================================== */}
    {/* End USDT Boss Footer Middle Area */}
    {/* ================================================== */}
    {/* scroll area */}
    <div className="scroll-area">
      <div className="top-wrap">
        <div className="go-top-btn-wraper">
          <div className="go-top go-top-button">
            <i className="fas fa-arrow-up"></i>
            <i className="fas fa-arrow-up"></i>
          </div>
        </div>
      </div>
    </div>
    {/* jquery js */}
    {/* bootstrap js */}
    </div>
  );
}
