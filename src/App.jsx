import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as mammoth from "mammoth";
import { v4 as uuidv4 } from "uuid";
import { saveAs } from "file-saver";
import {
  Document as DocxDocument,
  Paragraph,
  TextRun,
  ImageRun,
  Packer,
  HeadingLevel,
  Media,
} from "docx";
import "./App.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const signatureFont = "Dancing Script";

function App() {
  const [documentFile, setDocumentFile] = useState(null);
  const [documentType, setDocumentType] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [signatureFields, setSignatureFields] = useState([]);
  const [activeField, setActiveField] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [textSignature, setTextSignature] = useState("");
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState("#000000");
  const [signatureType, setSignatureType] = useState("draw");
  const [error, setError] = useState(null);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [signaturePad, setSignaturePad] = useState(null);
  const [docxContent, setDocxContent] = useState([]);
  const [docxImages, setDocxImages] = useState([]);

  const colorOptions = [
    { value: "#000000", label: "Black" },
    { value: "#FF0000", label: "Red" },
    { value: "#0000FF", label: "Blue" },
    { value: "#008000", label: "Green" },
    { value: "#800080", label: "Purple" },
  ];

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const documentContainerRef = useRef(null);
  const docxContainerRef = useRef(null);

  const readFileHeader = async (file) => {
    const buffer = await file.slice(0, 4).arrayBuffer();
    const view = new DataView(buffer);
    return view.getUint32(0, false).toString(16);
  };

  const validateFileType = (file, magic) => {
    const signatures = {
      pdf: "25504446",
      zip: "504b0304",
      jpg: "ffd8ffe0",
      png: "89504e47",
      gif: "47494638",
    };

    if (magic === signatures.pdf) return "pdf";
    if (magic === signatures.zip) return "docx";
    if (["ffd8ffe0", "ffd8ffe1", "ffd8ffe2"].includes(magic)) return "image";
    if (magic === signatures.png) return "image";
    if (magic === signatures.gif) return "image";

    if (file.type === "application/pdf") return "pdf";
    if (file.type.includes("vnd.openxmlformats") || file.name.endsWith(".docx"))
      return "docx";
    if (file.type.startsWith("image/")) return "image";

    throw new Error("Unsupported file type");
  };

  useEffect(() => {
    const loadFont = async () => {
      try {
        const fontLink = document.createElement("link");
        fontLink.href =
          "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap";
        fontLink.rel = "stylesheet";
        document.head.appendChild(fontLink);
        setTimeout(() => setFontLoaded(true), 500);
      } catch (err) {
        console.error("Failed to load font:", err);
      }
    };
    loadFont();
  }, []);

  useEffect(() => {
    let pad = null;
    const initializeSignaturePad = async () => {
      if (canvasRef.current) {
        try {
          const SignaturePad = (await import("signature_pad")).default;
          pad = new SignaturePad(canvasRef.current, {
            backgroundColor: "rgba(255, 255, 255, 0)",
            penColor: "rgb(0, 0, 0)",
            minWidth: 0.5,
            maxWidth: 2.5,
            throttle: 16,
          });
          setSignaturePad(pad);

          const resizeCanvas = () => {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvasRef.current.width = canvasRef.current.offsetWidth * ratio;
            canvasRef.current.height = canvasRef.current.offsetHeight * ratio;
            canvasRef.current.getContext("2d").scale(ratio, ratio);
            pad.clear();
          };

          window.addEventListener("resize", resizeCanvas);
          resizeCanvas();

          return () => window.removeEventListener("resize", resizeCanvas);
        } catch (err) {
          console.error("Failed to initialize signature pad:", err);
          setError(
            "Failed to initialize signature pad. Please refresh the page."
          );
        }
      }
    };
    initializeSignaturePad();
    return () => pad?.off();
  }, []);

  const parseDocx = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });

      const paragraphs = result.value.split("\n").filter((p) => p.trim());
      setDocxContent(paragraphs);

      return paragraphs;
    } catch (err) {
      console.error("Error parsing DOCX:", err);
      setError("Failed to parse Word document");
      return [];
    }
  };

  const handleDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setError(null);
  };
  const enhanceDocxDisplay = async (docxContent) => {
    try {
      // Create styled paragraphs for better DOCX display
      const styledContent = docxContent.map((para, index) => {
        // Try to detect headings and apply appropriate styling
        const isHeading =
          para.trim().length < 50 &&
          (para.trim().endsWith(":") ||
            !para.includes(".") ||
            para.toUpperCase() === para);

        // Return formatted paragraph with appropriate styling
        return {
          text: para,
          isHeading,
          style: isHeading ? "heading" : "normal",
          id: `para-${index}`,
        };
      });

      setDocxContent(styledContent);
    } catch (err) {
      console.error("Error enhancing DOCX display:", err);
      // If enhancement fails, just use the plain content
      setDocxContent(
        docxContent.map((para) => ({
          text: para,
          style: "normal",
        }))
      );
    }
  };

  // Add this function to provide a more robust DOCX handling strategy
  const handleDocxDocument = async (file) => {
    try {
      setIsConverting(true);

      // First try to parse the DOCX using mammoth
      const docxContent = await parseDocx(file);

      // Try PDF conversion first
      try {
        const pdfFile = await convertDocxToPdf(file, docxContent);
        if (pdfFile) {
          console.log("Successfully converted DOCX to PDF");
          setDocumentFile(pdfFile);
          setDocumentType("pdf");
          return;
        }
      } catch (conversionError) {
        console.error("PDF conversion failed:", conversionError);
        // Continue to fallback if conversion fails
      }

      // Fallback to improved DOCX rendering
      console.log("Using enhanced DOCX fallback display");
      setDocumentFile(file);
      setDocumentType("docx");

      // Enhance DOCX display with better formatting
      await enhanceDocxDisplay(docxContent);
    } catch (err) {
      console.error("DOCX processing error:", err);
      setError(`Failed to process Word document: ${err.message}`);

      // Ultimate fallback - basic text display
      setDocumentFile(file);
      setDocumentType("docx");
    } finally {
      setIsConverting(false);
    }
  };

  // Improved conversion function with better error handling
  const convertDocxToPdf = async (file, docxContent = null) => {
    try {
      // If docxContent wasn't provided, extract it
      if (!docxContent) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        docxContent = result.value.split("\n").filter((p) => p.trim());
      }

      // Join content for PDF creation
      const fullText = Array.isArray(docxContent)
        ? docxContent.join("\n\n")
        : docxContent;

      // Create PDF with more robust error handling
      const pdfDoc = await PDFDocument.create();

      // Use a try-catch for font embedding in case it fails
      let font;
      try {
        font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      } catch (fontError) {
        console.warn(
          "Failed to embed Times Roman, using default font:",
          fontError
        );
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }

      // Safety checks
      if (!fullText || fullText.length === 0) {
        throw new Error("No content found in document");
      }

      // Create pages with content
      const textChunks = chunkText(fullText, 2500); // Smaller chunks for more reliability

      // Add all pages
      for (const chunk of textChunks) {
        const page = pdfDoc.addPage([612, 792]); // Standard US Letter size
        const { width, height } = page.getSize();

        // Draw text with safe margins
        const margin = 72; // 1 inch margins
        page.drawText(chunk, {
          x: margin,
          y: height - margin,
          size: 11,
          font: font,
          maxWidth: width - margin * 2,
          lineHeight: 14,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      return new File([pdfBlob], `${file.name.replace(/\.[^/.]+$/, "")}.pdf`, {
        type: "application/pdf",
      });
    } catch (err) {
      console.error("Error in PDF conversion:", err);
      // Pass the error up to be handled by the calling function
      throw err;
    }
  };

  // Helper function to chunk text for PDF pages
  const chunkText = (text, chunkSize) => {
    const chunks = [];
    let currentChunk = "";
    const paragraphs = text.split("\n");

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > chunkSize) {
        chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  };

  // Update your handleFileChange function to use the improved handler
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError(null);
    setSignatureFields([]);
    setOriginalFile(file);
    setIsConverting(true);
    setDocxContent([]);
    setDocxImages([]);

    try {
      const magic = await readFileHeader(file);
      const validatedType = validateFileType(file, magic);

      if (validatedType === "pdf") {
        setDocumentFile(file);
        setDocumentType("pdf");
      } else if (validatedType === "docx") {
        // Use the improved DOCX handler
        await handleDocxDocument(file);
      } else if (validatedType === "image") {
        setDocumentFile(file);
        setDocumentType("image");
      }
    } catch (err) {
      console.error("File processing error:", err);
      setError(err.message || "Failed to process the document");
    } finally {
      setIsConverting(false);
    }
  };

  const addSignatureField = () => {
    const newField = {
      id: uuidv4(),
      x: 50,
      y: 50,
      width: 200,
      height: 80,
      signatureData: null,
      pageNumber,
      type: signatureType,
      fontSize,
      fontColor,
      textValue: textSignature,
    };
    setSignatureFields([...signatureFields, newField]);
    setActiveField(newField.id);
  };

  const updateSignatureField = (fieldId, data) => {
    setSignatureFields(
      signatureFields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              signatureData: data,
              type: signatureType,
              fontSize,
              fontColor,
              textValue: textSignature,
            }
          : field
      )
    );
  };

  const captureSignature = () => {
    let data = null;
    if (signatureType === "draw" && signaturePad && !signaturePad.isEmpty()) {
      data = signaturePad.toDataURL("image/png");
    } else if (signatureType === "text" && textSignature.trim()) {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      ctx.font = `${fontSize}px ${fontLoaded ? signatureFont : "cursive"}`;
      ctx.fillStyle = fontColor;
      ctx.textBaseline = "middle";
      const textWidth = ctx.measureText(textSignature).width;
      if (textWidth > canvas.width) canvas.width = textWidth + 20;
      ctx.font = `${fontSize}px ${fontLoaded ? signatureFont : "cursive"}`;
      ctx.fillStyle = fontColor;
      ctx.textBaseline = "middle";
      ctx.fillText(textSignature, 10, canvas.height / 2);
      data = canvas.toDataURL("image/png");
    }
    return data;
  };

  const saveSignature = () => {
    if (!activeField) {
      setError("Please select or add a signature field first");
      return;
    }
    const data = captureSignature();
    if (!data) {
      setError("Please create a signature before saving");
      return;
    }
    updateSignatureField(activeField, data);
    if (signaturePad) signaturePad.clear();
    setTextSignature("");
    setError(null);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!activeField) {
      setError("Please select or add a signature field first");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image size should be less than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxWidth = 400;
        const maxHeight = 150;
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (maxHeight / height) * width;
          height = maxHeight;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        updateSignatureField(activeField, canvas.toDataURL("image/png"));
        setError(null);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const clearSignature = () => {
    if (signaturePad) signaturePad.clear();
    setTextSignature("");
  };

  const removeActiveField = () => {
    if (!activeField) return;
    setSignatureFields(
      signatureFields.filter((field) => field.id !== activeField)
    );
    setActiveField(null);
  };

  const handleFieldMouseDown = (e, fieldId) => {
    e.stopPropagation();
    setActiveField(fieldId);
    const startX = e.clientX;
    const startY = e.clientY;
    const field = signatureFields.find((f) => f.id === fieldId);
    if (!field) return;
    const startFieldX = field.x;
    const startFieldY = field.y;

    const handleMouseMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setSignatureFields(
        signatureFields.map((field) =>
          field.id === fieldId
            ? { ...field, x: startFieldX + dx, y: startFieldY + dy }
            : field
        )
      );
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const getImageData = async (dataUrl) => {
    const response = await fetch(dataUrl);
    const buffer = await response.arrayBuffer();
    return buffer;
  };

  const createSignedDocx = async () => {
    if (!originalFile || documentType !== "docx") return;

    try {
      const arrayBuffer = await originalFile.arrayBuffer();

      const doc = new DocxDocument({
        creator: "Document Signer App",
        description: "Document with digital signatures",
        styles: {
          paragraphStyles: [
            {
              id: "Normal",
              name: "Normal",
              run: {
                size: 24,
              },
              paragraph: {
                spacing: { line: 276 },
              },
            },
          ],
        },
        sections: [
          {
            properties: {},
            children: [
              // Original content
              ...(await mammoth.extractRawText({ arrayBuffer }).then((result) =>
                result.value
                  .split("\n")
                  .filter((p) => p.trim())
                  .map(
                    (para) =>
                      new Paragraph({
                        children: [new TextRun(para)],
                        spacing: { line: 300 },
                      })
                  )
              )),

              // Signature section
              new Paragraph({
                children: [new TextRun("")],
              }),

              new Paragraph({
                text: "Signatures:",
                heading: HeadingLevel.HEADING_2,
              }),

              // Signature images
              ...(
                await Promise.all(
                  signatureFields.map(async (field) => {
                    if (!field.signatureData) return null;

                    try {
                      const imageData = await getImageData(field.signatureData);
                      const media = Media.addImage(
                        doc,
                        imageData,
                        field.width,
                        field.height
                      );

                      return new Paragraph({
                        children: [media],
                        spacing: { line: 200 }, // Changed from spacing: { after: 200 }
                      });
                    } catch (err) {
                      console.error("Error adding signature:", err);
                      return null;
                    }
                  })
                )
              ).filter(Boolean),
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      return new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    } catch (err) {
      console.error("Error creating signed DOCX:", err);
      throw new Error("Failed to create valid Word document");
    }
  };
  const downloadSignedDocument = async () => {
    if (!documentFile) {
      setError("Please upload a document first");
      return;
    }
    if (signatureFields.length === 0) {
      setError("Please add at least one signature field");
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();

      // Handle different document types
      if (documentType === "pdf") {
        // For PDFs, copy the existing pages
        const existingPdfBytes = await documentFile.arrayBuffer();
        const existingPdf = await PDFDocument.load(existingPdfBytes);
        const pages = await pdfDoc.copyPages(
          existingPdf,
          existingPdf.getPageIndices()
        );
        pages.forEach((page) => pdfDoc.addPage(page));
      } else if (documentType === "docx") {
        // For DOCX, convert to PDF text
        const text = await parseDocx(originalFile);
        const fullText = Array.isArray(text) ? text.join("\n\n") : text;
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Add pages with content
        const textChunks = chunkText(fullText, 2500);
        for (const chunk of textChunks) {
          const page = pdfDoc.addPage([612, 792]);
          const { width, height } = page.getSize();
          const margin = 72;
          page.drawText(chunk, {
            x: margin,
            y: height - margin,
            size: 11,
            font: font,
            maxWidth: width - margin * 2,
            lineHeight: 14,
          });
        }
      } else if (documentType === "image") {
        // For images, embed them in PDF
        const imageBytes = await documentFile.arrayBuffer();
        let image;

        if (
          documentFile.type === "image/jpeg" ||
          documentFile.name.endsWith(".jpg") ||
          documentFile.name.endsWith(".jpeg")
        ) {
          image = await pdfDoc.embedJpg(imageBytes);
        } else {
          image = await pdfDoc.embedPng(imageBytes);
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }

      // Add signatures to all pages (for simplicity, we'll put them on the first page)
      const pages = pdfDoc.getPages();
      if (pages.length > 0) {
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();

        for (const field of signatureFields) {
          if (!field.signatureData) continue;

          try {
            const pngImageBytes = await fetch(field.signatureData).then((res) =>
              res.arrayBuffer()
            );
            const pngImage = await pdfDoc.embedPng(pngImageBytes);

            // Scale coordinates to PDF size (assuming original display was 600px wide)
            const scale = width / 600;
            const pdfX = field.x * scale;
            const pdfY = height - field.y * scale - field.height * scale;
            const pdfWidth = field.width * scale;
            const pdfHeight = field.height * scale;

            firstPage.drawImage(pngImage, {
              x: pdfX,
              y: pdfY,
              width: pdfWidth,
              height: pdfHeight,
            });
          } catch (err) {
            console.error("Error embedding signature:", err);
          }
        }
      }

      // Save and download the PDF
      const pdfBytes = await pdfDoc.save();
      saveAs(
        new Blob([pdfBytes], { type: "application/pdf" }),
        `signed-${originalFile.name.replace(/\.[^/.]+$/, "")}.pdf`
      );
    } catch (error) {
      console.error("Error generating document:", error);
      setError(`Failed to generate signed document: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Document Signer</h1>
        <div className="file-upload-container">
          <label className="file-upload-label">
            <input
              type="file"
              accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="file-upload-input"
            />
            <span className="file-upload-button">Upload Document</span>
          </label>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      {isConverting && (
        <div className="converting-message">
          <div className="spinner"></div>
          <p>Processing document...</p>
        </div>
      )}

      <div className="main-content">
        <div className="document-container" ref={documentContainerRef}>
          {documentFile && documentType === "pdf" ? (
            <Document
              file={documentFile}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={() => setError("Failed to load document")}
              loading={<div className="loading-pdf">Loading document...</div>}
            >
              <Page
                pageNumber={pageNumber}
                width={600}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              >
                {signatureFields
                  .filter((field) => field.pageNumber === pageNumber)
                  .map((field) => (
                    <div
                      key={field.id}
                      className={`signature-field ${
                        activeField === field.id ? "active" : ""
                      }`}
                      style={{
                        left: `${field.x}px`,
                        top: `${field.y}px`,
                        width: `${field.width}px`,
                        height: `${field.height}px`,
                      }}
                      onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                    >
                      {field.signatureData && (
                        <img
                          src={field.signatureData}
                          alt="Signature"
                          className="signature-img"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      )}
                    </div>
                  ))}
              </Page>
            </Document>
          ) : documentFile && documentType === "docx" ? (
            <div className="docx-container" ref={docxContainerRef}>
              <div className="docx-preview">
                {docxContent.length > 0 ? (
                  docxContent.map((para, index) => (
                    <p
                      key={para.id || index}
                      className={`docx-paragraph ${para.style || "normal"}`}
                    >
                      {para.text || para}
                    </p>
                  ))
                ) : (
                  <div className="loading-docx">Loading Word document...</div>
                )}
                {signatureFields.map((field) => (
                  <div
                    key={field.id}
                    className={`signature-field ${
                      activeField === field.id ? "active" : ""
                    }`}
                    style={{
                      left: `${field.x}px`,
                      top: `${field.y}px`,
                      width: `${field.width}px`,
                      height: `${field.height}px`,
                    }}
                    onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                  >
                    {field.signatureData && (
                      <img
                        src={field.signatureData}
                        alt="Signature"
                        className="signature-img"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : documentFile && documentType === "image" ? (
            <div className="image-container">
              <img
                src={URL.createObjectURL(documentFile)}
                alt="Document"
                style={{ maxWidth: "100%", position: "relative" }}
              />
              {signatureFields.map((field) => (
                <div
                  key={field.id}
                  className={`signature-field ${
                    activeField === field.id ? "active" : ""
                  }`}
                  style={{
                    position: "absolute",
                    left: `${field.x}px`,
                    top: `${field.y}px`,
                    width: `${field.width}px`,
                    height: `${field.height}px`,
                  }}
                  onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                >
                  {field.signatureData && (
                    <img
                      src={field.signatureData}
                      alt="Signature"
                      className="signature-img"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="upload-prompt">
              <div className="upload-icon">📄</div>
              <p>Upload a document to begin</p>
              <p className="supported-formats">
                Supported formats: PDF, Word (DOCX), Images (JPG, PNG)
              </p>
            </div>
          )}
        </div>

        <div className="tools-panel">
          <div className="signature-type-selector">
            <h3 className="section-title">Signature Type</h3>
            <div className="signature-type-options">
              <label
                className={`signature-type-option ${
                  signatureType === "draw" ? "active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="signatureType"
                  value="draw"
                  checked={signatureType === "draw"}
                  onChange={() => setSignatureType("draw")}
                  className="option-input"
                />
                <div className="option-content">
                  <div className="option-icon">✍️</div>
                  <span>Draw</span>
                </div>
              </label>
              <label
                className={`signature-type-option ${
                  signatureType === "text" ? "active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="signatureType"
                  value="text"
                  checked={signatureType === "text"}
                  onChange={() => setSignatureType("text")}
                  className="option-input"
                />
                <div className="option-content">
                  <div className="option-icon">🖋️</div>
                  <span>Text</span>
                </div>
              </label>
              <label
                className={`signature-type-option ${
                  signatureType === "image" ? "active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="signatureType"
                  value="image"
                  checked={signatureType === "image"}
                  onChange={() => setSignatureType("image")}
                  className="option-input"
                />
                <div className="option-content">
                  <div className="option-icon">🖼️</div>
                  <span>Image</span>
                </div>
              </label>
            </div>
          </div>

          <div className="field-controls">
            <button
              onClick={addSignatureField}
              className="tool-btn add-field-btn"
              disabled={!documentFile}
            >
              + Add Signature Field
            </button>

            {activeField && (
              <button
                onClick={removeActiveField}
                className="tool-btn remove-field-btn"
              >
                × Remove Field
              </button>
            )}
          </div>

          <div className="signature-input-container">
            {signatureType === "draw" && (
              <div className="signature-pad-container">
                <div className="canvas-container">
                  <canvas ref={canvasRef} className="signature-canvas"></canvas>
                </div>
              </div>
            )}

            {signatureType === "text" && (
              <div className="text-signature-container">
                <input
                  type="text"
                  value={textSignature}
                  onChange={(e) => setTextSignature(e.target.value)}
                  placeholder="Enter your signature text"
                  className="text-signature-input"
                  style={{
                    fontFamily: fontLoaded ? signatureFont : "cursive",
                    fontSize: `${fontSize}px`,
                    color: fontColor,
                  }}
                />
                <div className="text-signature-options">
                  <div className="option-group">
                    <label className="option-label">Size:</label>
                    <input
                      type="range"
                      min="12"
                      max="48"
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      className="font-size-slider"
                    />
                    <span className="font-size-value">{fontSize}px</span>
                  </div>
                  <div className="option-group">
                    <label className="option-label">Color:</label>
                    <div className="color-options">
                      {colorOptions.map((color) => (
                        <button
                          key={color.value}
                          className={`color-option ${
                            fontColor === color.value ? "active" : ""
                          }`}
                          style={{ backgroundColor: color.value }}
                          onClick={() => setFontColor(color.value)}
                          title={color.label}
                        />
                      ))}
                      <input
                        type="color"
                        value={fontColor}
                        onChange={(e) => setFontColor(e.target.value)}
                        className="color-picker"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {signatureType === "image" && (
              <div className="image-signature-container">
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="tool-btn upload-image-btn"
                >
                  Upload Signature Image
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="file-input-hidden"
                />
                <div className="image-requirements">
                  <small>PNG, JPG (Max 2MB)</small>
                </div>
              </div>
            )}

            <div className="signature-actions">
              <button onClick={clearSignature} className="tool-btn clear-btn">
                Clear
              </button>
              <button
                onClick={saveSignature}
                className="tool-btn save-btn"
                disabled={
                  !activeField ||
                  (signatureType === "draw" &&
                    (!signaturePad || signaturePad.isEmpty())) ||
                  (signatureType === "text" && !textSignature.trim())
                }
              >
                Save Signature
              </button>
            </div>
          </div>

          {activeField && (
            <div className="active-field-info">
              <p>Selected field ID: {activeField.substring(0, 8)}</p>
              <p>Signature will be applied to this field when saved</p>
            </div>
          )}

          <button
            onClick={downloadSignedDocument}
            className="tool-btn download-btn"
            disabled={
              !documentFile || signatureFields.length === 0 || isDownloading
            }
          >
            {isDownloading ? (
              <>
                <span className="spinner"></span>
                Downloading...
              </>
            ) : (
              "Download Signed Document"
            )}
          </button>
          {numPages && documentType === "pdf" && (
            <div className="page-controls">
              <button
                onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                disabled={pageNumber <= 1}
                className="page-btn"
              >
                Previous
              </button>
              <span className="page-info">
                Page {pageNumber} of {numPages}
              </span>
              <button
                onClick={() =>
                  setPageNumber(Math.min(numPages, pageNumber + 1))
                }
                disabled={pageNumber >= numPages}
                className="page-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
