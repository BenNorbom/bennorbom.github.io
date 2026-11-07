/**
 * ============================================================================
 * SITE TEXT & LINKS CONFIGURATION — EDIT HERE OR DIRECTLY ON THE WEBSITE
 * ============================================================================
 * Every heading, subtitle, concise description, button label, external link,
 * and download path on the website is stored here.
 *
 * You can edit this text in two ways:
 *   1. Directly on the website itself: click "Edit Website Text" in the
 *      bottom-right corner of the page, click any text, and type — your edits
 *      are automatically saved directly back into this file on disk!
 *   2. Manually right here in src/siteContent.ts in any text editor.
 *
 * Set ENABLE_LIVE_TEXT_EDITOR = false when you are ready to deploy publicly
 * (it also automatically disables itself in production builds).
 */

export const ENABLE_LIVE_TEXT_EDITOR = false

export interface SiteContentData {
  identity: {
    fullName: string
    citationName: string
    siteTitle: string
    tagline: string
    shortBio: string
    siteUrl: string
    githubUrl: string
    linkedinUrl: string
  }
  hero: {
    eyebrow: string
    heading: string
    subheading: string
    aboutTitle: string
    description: string
  }
  nav: {
    dbsResearch: string
    blackHole: string
    project64: string
    paperButton: string
    wallpaperButton: string
  }
  dbs: {
    eyebrow: string
    title: string
    description: string
    syntheticNotice: string
    paper: {
      badge: string
      journal: string
      title: string
      authors: string
      doi: string
      url: string
      buttonLabel: string
    }
  }
  blackHole: {
    eyebrow: string
    title: string
    simTitle: string
    description: string
    download: {
      badge: string
      title: string
      subtitle: string
      buttonLabel: string
      fileName: string
      downloadUrl: string
      fileSizeNote: string
    }
  }
  project64: {
    eyebrow: string
    title: string
    description: string
    resetButtonLabel: string
  }
  footer: {
    copyrightName: string
    note: string
  }
}

export const SITE_CONTENT: SiteContentData = {
  "identity": {
    "fullName": "Benjamin Norbom",
    "citationName": "Benjamin D. Norbom",
    "siteTitle": "Benjamin Norbom — Research, Simulation & Engineering",
    "tagline": "Student at the University of Florida",
    "shortBio": "Interactive portfolio of research, neural stimulation visualization software, embedded motion planning, and real-time relativistic ray tracing.",
    "siteUrl": "https://bennorbom.github.io/",
    "githubUrl": "https://github.com/BenNorbom",
    "linkedinUrl": "https://www.linkedin.com/in/benjamin-norbom/"
  },
  "hero": {
    "eyebrow": "",
    "heading": "Benjamin Norbom",
    "subheading": "",
    "aboutTitle": "About Me",
    "description": "Hi, my name is Benjamin Norbom, and I am a senior computer engineering student at the University of Florida. During my sophomore year, I decided to pursue a career in medicine and am currently applying to medical school. However, I chose to continue studying computer engineering because of my interest in the research and projects it has allowed me to pursue. As medicine continues to evolve through advances in artificial intelligence and other technologies, I hope to draw on my engineering background to help develop improved treatments and provide better care for my future patients."
  },
  "nav": {
    "dbsResearch": "DBS Research",
    "blackHole": "Black Hole Simulation",
    "project64": "Project 64",
    "paperButton": "Published Paper",
    "wallpaperButton": "Download Wallpaper"
  },
  "dbs": {
    "eyebrow": "",
    "title": "Rapid CNN Surrogate Modeling of Deep Brain Stimulation & 3D Tractography Visualization",
    "description": "Deep brain stimulation (DBS) is a surgical procedure used to manage symptoms of movement disorders, including Parkinson's disease and essential tremor. During the procedure, a surgeon implants an electrode directly into the patient's brain. Following implantation, physicians must determine the optimal combination of stimulation settings for each individual patient. Currently, this process relies largely on trial and error, which can delay treatment and make it difficult to identify the most effective settings.\n\nSoftware tools exist to help guide physicians through this process by predicting neural activation. Using these predictions, physicians can select settings that activate the desired brain structures while minimizing unintended activation of surrounding tissue. However, existing software faces a significant tradeoff between speed and accuracy. The most biophysically accurate models are computationally intensive and too slow for practical clinical use, while faster models make substantial simplifications.\n\nTo address this limitation, our team set out to develop a machine learning model that could maintain the biophysical accuracy of existing models while operating fast enough for clinical use. We trained several machine learning models using predictions generated by the McIntyre-Richardson-Grill (MRG) model, widely considered the gold standard for predicting neural activation in the field. We then evaluated our models using neuron positions derived from a patient group average and tissue conductivity estimated from an actual patient's preoperative MRI.\n\nOur best-performing model achieved less than 1% error compared to the gold standard while running nearly five orders of magnitude faster. These results demonstrated the potential for machine learning to bridge the gap between computational accuracy and clinical practicality, ultimately making more accurate DBS treatment planning feasible. This work was published in the journal Deep Brain Stimulation.",
    "syntheticNotice": "",
    "paper": {
      "badge": "PEER-REVIEWED PUBLICATION",
      "journal": "Deep Brain Stimulation (Elsevier, 2026)",
      "title": "Comparison of Machine Learning Surrogate Models for Prediction of Single-Fiber Activation in Deep Brain Stimulation",
      "authors": "Jorge Alberto, Benjamin D. Norbom, Justin E. Golabek, Joshua K. Wong, Matthew A. Schiefer, Erin E. Patrick",
      "doi": "10.1016/j.jdbs.2026.08.003",
      "url": "https://doi.org/10.1016/j.jdbs.2026.08.003",
      "buttonLabel": "Read Paper in Deep Brain Stimulation"
    }
  },
  "blackHole": {
    "eyebrow": "",
    "title": "Relativistic Kerr Black Hole Simulation & Desktop Wallpaper",
    "simTitle": "Asterion — Relativistic Black Hole Passage",
    "description": "I developed a simulation of a supermassive blackhole for my wallpaper. Drag anywhere in the viewport to look around. Feel free to download!",
    "download": {
      "badge": "WINDOWS 10 / 11 (x64) · ALL SCREEN SIZES & DPI SCALES",
      "title": "Download Black Hole Live Wallpaper",
      "subtitle": "Runs the elliptical Kerr black-hole simulation directly behind your Windows desktop icons across any screen resolution, aspect ratio, or DPI scale. Automatically pauses GPU rendering whenever another window covers the screen, and includes system-tray & lock-screen controls.",
      "buttonLabel": "Download Wallpaper Installer (.exe)",
      "fileName": "Black-Hole-Wallpaper-1.0.0-setup.exe",
      "downloadUrl": "https://github.com/BenNorbom/bennorbom.github.io/releases/download/v1.0.0/Black-Hole-Wallpaper-1.0.0-setup.exe",
      "fileSizeNote": "~107 MB · Standalone Wallpaper"
    }
  },
  "project64": {
    "eyebrow": "",
    "title": "Project 64 — Autonomous Chessboard & Pathfinding Simulator",
    "description": "For my senior engineering design project, I am part of a team developing an autonomous chessboard that allows users to play against opponents anywhere in the world using a physical board. The system electronically moves the opponent's pieces in response to moves made remotely. While the hardware is still under development, I developed this software as a proof of concept, focusing on implementing and testing the movement-planning algorithm.",
    "resetButtonLabel": "Reset Board"
  },
  "footer": {
    "copyrightName": "Benjamin Norbom",
    "note": ""
  }
}
