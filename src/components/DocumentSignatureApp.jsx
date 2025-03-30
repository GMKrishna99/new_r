import React, { useState, useRef } from "react";
import { PDFDocument, rgb } from 'pdf-lib';

const DocumentSignatureApp = () => {
  const [document, setDocument] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [currentSignature, setCurrentSignature] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const signaturePadRef = useRef(null);
  const documentContainerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [savedDocuments, setSavedDocuments] = useState([]);

  // Handle document upload
  const handleDocumentUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setDocument({
          id: Date.now(),
          name: file.name,
          content: event.target.result,
          signatures: [],
        });
        setSignatures([]);
      };
      reader.readAsDataURL(file);
    }
  };

  // Add a new signature field
  const addSignatureField = () => {
    const newSignature = {
      id: Date.now(),
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      path: [],
      signed: false,
    };
    setSignatures([...signatures, newSignature]);
  };

  // Start drawing signature
  const startDrawing = (e, signatureId) => {
    const canvas = document.getElementById(`signature-canvas-${signatureId}`);
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const currentSig = signatures.find((sig) => sig.id === signatureId);
    if (currentSig) {
      const updatedSignature = {
        ...currentSig,
        path: [...currentSig.path, { x, y, type: "start" }],
      };
      setSignatures(
        signatures.map((sig) =>
          sig.id === signatureId ? updatedSignature : sig
        )
      );
      setIsDrawing(true);
    }
  };

  // Draw signature
  const draw = (e, signatureId) => {
    if (!isDrawing) return;

    const canvas = document.getElementById(`signature-canvas-${signatureId}`);
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const currentSig = signatures.find((sig) => sig.id === signatureId);
    if (currentSig) {
      const updatedSignature = {
        ...currentSig,
        path: [...currentSig.path, { x, y, type: "draw" }],
      };
      setSignatures(
        signatures.map((sig) =>
          sig.id === signatureId ? updatedSignature : sig
        )
      );
    }
  };

  // Stop drawing signature
  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Render signature on canvas
  const renderSignature = (canvas, path) => {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;

    for (let i = 0; i < path.length; i++) {
      const point = path[i];

      if (point.type === "start") {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    }
  };

  // Start dragging signature field
  const startDrag = (e, signature) => {
    if (e.target.tagName === "CANVAS") return; // Don't drag if clicking on canvas (for drawing)

    setIsDragging(true);
    setCurrentSignature(signature);

    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Handle dragging
  const handleDrag = (e) => {
    if (!isDragging || !currentSignature || !documentContainerRef.current)
      return;

    const containerRect = documentContainerRef.current.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - dragOffset.x;
    const newY = e.clientY - containerRect.top - dragOffset.y;

    // Update signature position
    setSignatures(
      signatures.map((sig) =>
        sig.id === currentSignature.id ? { ...sig, x: newX, y: newY } : sig
      )
    );
  };

  // Stop dragging
  const stopDrag = () => {
    setIsDragging(false);
    setCurrentSignature(null);
  };

  const saveDocument = async () => {
    if (!document || !document.content.startsWith("data:application/pdf")) return;
  
    const existingPdfBytes = await fetch(document.content).then(res => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
  
    const form = pdfDoc.getForm();
  
    signatures.forEach(signature => {
      const signatureField = form.createTextField(`Signature-${signature.id}`);
      signatureField.setText('Signed Here');  // Placeholder text
      signatureField.addToPage(pdfDoc.getPages()[0], {
        x: signature.x,
        y: signature.y,
        width: signature.width,
        height: signature.height,
        backgroundColor: rgb(1, 1, 1), // White background
      });
    });
  
    form.flatten(); // Make it editable
  
    const pdfBytes = await pdfDoc.save();
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = "SignedDocument.pdf";
    link.click();
  };

  // Load a saved document
  const loadDocument = (doc) => {
    setDocument(doc);
    setSignatures(doc.signatures || []);
  };

  // Effect to render signatures when they change
  React.useEffect(() => {
    signatures.forEach((signature) => {
      const canvas = document.getElementById(
        `signature-canvas-${signature.id}`
      );
      if (canvas) {
        renderSignature(canvas, signature.path);
      }
    });
  }, [signatures]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        Document Signature Application
      </h1>

      <div className="mb-4 flex gap-4">
        <div>
          <input
            type="file"
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            onChange={handleDocumentUpload}
            className="block w-full text-sm mb-2"
          />

          {document && (
            <button
              onClick={addSignatureField}
              className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
            >
              Add Signature Field
            </button>
          )}

          {document && signatures.length > 0 && (
            <button
              onClick={saveDocument}
              className="bg-green-500 text-white px-4 py-2 rounded"
            >
              Save Document
            </button>
          )}
        </div>

        {savedDocuments.length > 0 && (
          <div className="ml-4">
            <h3 className="font-bold mb-2">Saved Documents</h3>
            <ul className="max-h-32 overflow-y-auto border border-gray-200 rounded p-2">
              {savedDocuments.map((doc) => (
                <li key={doc.id} className="mb-1">
                  <button
                    onClick={() => loadDocument(doc)}
                    className="text-blue-500 hover:underline"
                  >
                    {doc.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {document && (
        <div
          ref={documentContainerRef}
          className="relative border border-gray-300 rounded min-h-96 bg-gray-100"
          onMouseMove={handleDrag}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          {/* Document display */}
          <div className="p-4">
            {document.content.startsWith("data:image") ? (
              <img
                src={document.content}
                alt="Document"
                className="max-w-full h-auto"
              />
            ) : (
              <div className="p-4 bg-white rounded shadow">
                <p>Document Preview: {document.name}</p>
                {/* In a real app, you would render PDF/DOCX content here */}
              </div>
            )}
          </div>

          {/* Signature fields */}
          {signatures.map((signature) => (
            <div
              key={signature.id}
              style={{
                position: "absolute",
                left: `${signature.x}px`,
                top: `${signature.y}px`,
                width: `${signature.width}px`,
                height: `${signature.height}px`,
                cursor:
                  isDragging && currentSignature?.id === signature.id
                    ? "grabbing"
                    : "grab",
              }}
              className="border-2 border-dashed border-blue-500 bg-white"
              onMouseDown={(e) => startDrag(e, signature)}
            >
              <div className="p-1 bg-blue-500 text-white text-xs mb-1">
                Signature Field (Drag to move)
              </div>
              <canvas
                id={`signature-canvas-${signature.id}`}
                width={signature.width - 4}
                height={signature.height - 24}
                className="border border-gray-300"
                onMouseDown={(e) => startDrawing(e, signature.id)}
                onMouseMove={(e) => draw(e, signature.id)}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentSignatureApp;
