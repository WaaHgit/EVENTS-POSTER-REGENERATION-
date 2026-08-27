import React, { useState } from 'react';
import { ShoppingBag, Phone, Sparkles, Check } from 'lucide-react';
import { type CallToActionSettings, type MerchandiseProduct } from '../types';

interface MerchandiseShowcaseProps {
  settings: CallToActionSettings;
}

export function MerchandiseShowcase({ settings }: MerchandiseShowcaseProps) {
  const [selectedProduct, setSelectedProduct] = useState<MerchandiseProduct | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  if (!settings.enabled || !settings.products || settings.products.length === 0) {
    return null;
  }

  const cleanPhone = (settings.phoneNumber || '').replace(/[^\d+]/g, '');

  const handleBuyClick = (product: MerchandiseProduct) => {
    setSelectedProduct(product);
    setOrderModalOpen(true);
  };

  return (
    <div id="merchandise-showcase-section" className="mt-12 pt-10 border-t border-slate-200">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-xs font-semibold uppercase tracking-wider mb-3 shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Exclusive Event Store</span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {settings.title || 'Official 20th Anniversary Merchandise'}
        </h3>
        {settings.subtitle && (
          <p className="mt-2 text-slate-600 text-sm sm:text-base leading-relaxed">
            {settings.subtitle}
          </p>
        )}

        {settings.phoneNumber && (
          <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm shadow-2xs">
            <Phone className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>Order Line: <strong className="text-slate-900 font-mono">{settings.phoneNumber}</strong></span>
            {settings.contactPerson && (
              <span className="text-xs text-slate-500 font-medium">({settings.contactPerson})</span>
            )}
            <a 
              href={`tel:${cleanPhone}`} 
              className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 underline"
            >
              Call Now
            </a>
          </div>
        )}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {settings.products.map((product) => {
          const zoom = product.zoom || 1;
          const offsetX = product.offsetX || 0;
          const offsetY = product.offsetY || 0;

          return (
            <div 
              key={product.id}
              id={`product-card-${product.id}`}
              className="group bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
            >
              {/* Product Image with Zoom, Pan, Crop and Axis Translation */}
              <div className="relative aspect-4/3 w-full bg-slate-950 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name}
                      style={{
                        transform: `scale(${zoom}) translate(${offsetX}%, ${offsetY}%)`,
                        transformOrigin: 'center center',
                        transition: 'transform 0.2s ease-out'
                      }}
                      className="w-full h-full object-cover select-none pointer-events-none"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-600">
                      <ShoppingBag className="w-10 h-10 text-slate-700 mb-1" />
                      <span className="text-xs text-slate-500 font-medium">Event Merchandise</span>
                    </div>
                  )}
                </div>

                {/* Badges */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {product.inStock === false && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-red-600/90 text-white font-bold text-[11px] uppercase tracking-wider shadow-xs">
                      Sold Out
                    </span>
                  )}
                  {product.price && (
                    <span className="inline-block px-3 py-1 rounded-full bg-slate-950/85 backdrop-blur-xs text-amber-300 font-bold text-xs tracking-wide shadow-xs">
                      {product.price}
                    </span>
                  )}
                </div>
              </div>

                {/* Product Info */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                      {product.name}
                    </h4>
                    <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 font-semibold">
                      {product.price}
                    </div>
                    <button
                      type="button"
                      id={`buy-btn-${product.id}`}
                      onClick={() => handleBuyClick(product)}
                      disabled={product.inStock === false}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors shadow-xs active:scale-98 cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{product.inStock === false ? 'Out of Stock' : 'Buy / Order Now'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Order Direct Call Modal / Confirmation */}
      {orderModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-left">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Order Item</h4>
                  <p className="text-xs text-slate-500">{selectedProduct.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="py-5 space-y-4">
              <div className="flex gap-4 items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-950 shrink-0 flex items-center justify-center">
                  <img 
                    src={selectedProduct.imageUrl} 
                    alt={selectedProduct.name}
                    style={{
                      transform: `scale(${selectedProduct.zoom || 1}) translate(${selectedProduct.offsetX || 0}%, ${selectedProduct.offsetY || 0}%)`,
                      transformOrigin: 'center center'
                    }}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h5 className="font-bold text-sm text-slate-900">{selectedProduct.name}</h5>
                  <p className="text-xs text-amber-700 font-extrabold mt-0.5">{selectedProduct.price}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{selectedProduct.description}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-900 text-xs leading-relaxed">
                <div className="font-semibold flex items-center gap-1.5 mb-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Direct Coordinator Hotline</span>
                </div>
                Clicking the button below will automatically open your phone dialer to call <strong>{settings.phoneNumber}</strong> ({settings.contactPerson || 'Merchandise Desk'}).
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOrderModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <a
                href={`tel:${cleanPhone}`}
                onClick={() => {
                  setOrderModalOpen(false);
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>Call {settings.phoneNumber} to Order</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
