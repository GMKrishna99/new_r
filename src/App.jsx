import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { PDFDocument } from "pdf-lib";
import SignaturePad from "signature_pad";
import { v4 as uuidv4 } from "uuid";
import "./App.css";

// Set up PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// Updated signature font
const signatureFont = "Dancing Script"; // Changed from "AutoGrafPersonal"

function App() {
  const [documentFile, setDocumentFile] = useState(null);
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
  const [signatureData, setSignatureData] = useState(null);

  // Color options for signature
  const colorOptions = [
    { value: "#000000", label: "Black" },
    { value: "#FF0000", label: "Red" },
    { value: "#0000FF", label: "Blue" },
    { value: "#008000", label: "Green" },
    { value: "#800080", label: "Purple" },
  ];

  const canvasRef = useRef(null);
  const signaturePadRef = useRef(null);
  const fileInputRef = useRef(null);
  const fontRef = useRef(null);

  // Load Google Font
  useEffect(() => {
    const loadFont = async () => {
      try {
        // Load Dancing Script from Google Fonts
        const fontLink = document.createElement("link");
        fontLink.href =
          "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap";
        fontLink.rel = "stylesheet";
        document.head.appendChild(fontLink);

        // Set a timeout to ensure the font is loaded before we use it
        setTimeout(() => {
          setFontLoaded(true);
        }, 500);
      } catch (err) {
        console.error("Failed to load font:", err);
      }
    };

    loadFont();
  }, []);

  // Initialize Signature Pad
  useEffect(() => {
    if (canvasRef.current) {
      signaturePadRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: "rgba(255, 255, 255, 0)",
        penColor: "rgb(0, 0, 0)",
        minWidth: 0.5,
        maxWidth: 2.5,
        throttle: 16,
      });

      const resizeCanvas = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvasRef.current.width = canvasRef.current.offsetWidth * ratio;
        canvasRef.current.height = canvasRef.current.offsetHeight * ratio;
        canvasRef.current.getContext("2d").scale(ratio, ratio);
        signaturePadRef.current.clear();
      };

      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      return () => {
        window.removeEventListener("resize", resizeCanvas);
      };
    }
  }, []);

  // Apply signature data to field when active field changes
  useEffect(() => {
    if (activeField && signatureData) {
      updateSignatureField(activeField, signatureData);
      setSignatureData(null); // Clear after applying
    }
  }, [activeField, signatureData]);

  const handleDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setError(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
      setDocumentFile(file);
      setSignatureFields([]);
      setError(null);
    } else {
      setError("Please upload a valid PDF file");
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

    setSignatureFields((prevFields) => [...prevFields, newField]);
    setActiveField(newField.id);

    // If we already have signature data waiting to be applied, it will be used for this new field
  };

  const updateSignatureField = (fieldId, data) => {
    setSignatureFields((prevFields) =>
      prevFields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              signatureData: data,
              type: signatureType,
              fontSize: fontSize,
              fontColor: fontColor,
              textValue: textSignature,
            }
          : field
      )
    );
  };

  const captureSignature = () => {
    let data = null;

    if (
      signatureType === "draw" &&
      signaturePadRef.current &&
      !signaturePadRef.current.isEmpty()
    ) {
      data = signaturePadRef.current.toDataURL("image/png");
    } else if (signatureType === "text" && textSignature.trim()) {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");

      // Configure canvas for text rendering
      ctx.font = `${fontSize}px ${fontLoaded ? signatureFont : "cursive"}`;
      ctx.fillStyle = fontColor;
      ctx.textBaseline = "middle";

      const textWidth = ctx.measureText(textSignature).width;
      if (textWidth > canvas.width) {
        canvas.width = textWidth + 20;
      }

      // Redraw with possibly adjusted canvas
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

    // Directly update the field
    updateSignatureField(activeField, data);

    // Clear the canvas and text input
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
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

        const imageData = canvas.toDataURL("image/png");
        updateSignatureField(activeField, imageData);
        setError(null);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const clearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
    setTextSignature("");
  };

  const removeActiveField = () => {
    if (!activeField) return;
    setSignatureFields((prevFields) =>
      prevFields.filter((field) => field.id !== activeField)
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

      setSignatureFields((prevFields) =>
        prevFields.map((field) =>
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

  const downloadSignedPdf = async () => {
    if (!documentFile) {
      setError("Please upload a PDF document first");
      return;
    }
    if (signatureFields.length === 0) {
      setError("Please add at least one signature field");
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const fileArrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => {
          setError("Failed to read PDF file");
          reject(error);
        };
        reader.readAsArrayBuffer(documentFile);
      });

      const pdfDoc = await PDFDocument.load(fileArrayBuffer);
      const pages = pdfDoc.getPages();

      // For text signatures, we'll use images instead of trying to embed the font
      // This ensures the signature appearance is preserved exactly
      for (const field of signatureFields) {
        if (!field.signatureData) continue;
        if (field.pageNumber > pages.length) continue;

        const page = pages[field.pageNumber - 1];
        const { width, height } = page.getSize();
        const displayWidth = 600;
        const scale = displayWidth / width;

        try {
          // For all signature types, use the image data
          const pngImageBytes = await fetch(field.signatureData).then((res) => {
            if (!res.ok) throw new Error("Failed to fetch signature image");
            return res.arrayBuffer();
          });

          const pngImage = await pdfDoc.embedPng(pngImageBytes);

          const pdfX = field.x / scale;
          const pdfY = height - field.y / scale - field.height / scale;
          const pdfWidth = field.width / scale;
          const pdfHeight = field.height / scale;

          page.drawImage(pngImage, {
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
          });
        } catch (err) {
          console.error("Error embedding signature:", err);
          continue;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "signed-document.pdf";
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      setError(null);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError("Failed to generate signed PDF. Please try again.");
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
              accept=".pdf"
              onChange={handleFileChange}
              className="file-upload-input"
            />
            <span className="file-upload-button">Upload PDF</span>
          </label>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="main-content">
        <div className="document-container">
          {documentFile ? (
            <Document
              file={documentFile}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={() => setError("Failed to load PDF")}
              loading={<div className="loading-pdf">Loading PDF...</div>}
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
          ) : (
            <div className="upload-prompt">
              <div className="upload-icon">📄</div>
              <p>Upload a PDF document to begin</p>
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
                    (!signaturePadRef.current ||
                      signaturePadRef.current.isEmpty())) ||
                  (signatureType === "text" && !textSignature.trim())
                }
              >
                Save Signature
              </button>
            </div>
          </div>

          {activeField && (
            <div className="active-field-info">
              <p>Selected field ID: {activeField}</p>
              <p>Signature will be applied to this field when saved</p>
            </div>
          )}

          <button
            onClick={downloadSignedPdf}
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
              "Download Signed PDF"
            )}
          </button>
          {numPages && (
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
