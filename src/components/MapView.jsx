import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistance } from '../utils/formatUtils';
import { isValidCoordinate } from '../utils/coordinateUtils';

const icon = (color, text) => L.divIcon({ className: 'visit-pin-wrap', html: `<span class="visit-pin ${color}"><em>${text}</em></span>`, iconSize: [32, 32], iconAnchor: [16, 16] });

export default function MapView({ visits, route, activeIndex, routeColor = '#2563eb', routeLabel = 'Actual', dealers = [], specialLocations = [] }) {
  const mapRef = useRef();
  const map = useRef();
  const layer = useRef();

  useEffect(() => {
    if (!map.current && mapRef.current) {
      map.current = L.map(mapRef.current, { zoomControl: true }).setView([20.59, 78.96], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map.current);
    }
  }, []);

  // Leaflet measures its container only at initialization. Route view toggles,
  // responsive breakpoints, and panel resizing can change the map dimensions
  // without a browser-window resize, leaving blank tile areas until the next zoom.
  useEffect(() => {
    const container = mapRef.current;
    if (!container || !map.current) return undefined;

    let frame;
    let timeout;
    const refreshMapSize = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      frame = requestAnimationFrame(() => {
        map.current?.invalidateSize({ pan: false, debounceMoveend: true });
        // Allow grid/flex layout to settle before Leaflet requests newly visible tiles.
        timeout = setTimeout(() => map.current?.invalidateSize({ pan: false, debounceMoveend: true }), 120);
      });
    };

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshMapSize) : null;
    observer?.observe(container);
    window.addEventListener('resize', refreshMapSize);
    refreshMapSize();

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', refreshMapSize);
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current?.clearLayers();
    layer.current = L.layerGroup().addTo(map.current);
    const bounds = [];
    visits.forEach((visit, index) => {
      const routeDetail = routeLabel === 'Planned' ? `<br/>Account code: ${visit.accountCode || '—'}<br/>Channel partner: ${visit.channelPartner || '—'}<br/>Beat: ${visit.beat || '—'}<br/>Distance from previous: ${visit.distanceFromPreviousLabel || formatDistance(visit.distanceFromPreviousKm, { first: index === 0 })}<br/>GPS: ${visit.start?.[0]?.toFixed(6) || '—'}, ${visit.start?.[1]?.toFixed(6) || '—'}` : '';
      const popup = `<b>${routeLabel} order #${index + 1}</b><br/><b>${visit.salesUserName}</b> · ${visit.empId}<br/>${visit.companyName || '—'}<br/><small>Check-in: ${visit.checkInLocation || '—'}<br/>Check-out: ${visit.checkOutLocation || '—'}<br/>${visit.durationMinutes?.toFixed(0) || 0} min · ₹${visit.basicOrderValue || 0}${routeDetail}</small>`;
      if (visit.start && isValidCoordinate(...visit.start)) {
        const marker = L.marker(visit.start, { icon: icon(index === activeIndex ? 'active' : routeLabel === 'Planned' ? 'planned' : 'green', index + 1) }).bindPopup(popup).addTo(layer.current);
        if (index === activeIndex) marker.openPopup();
        bounds.push(visit.start);
      }
      if (visit.end && isValidCoordinate(...visit.end)) { L.marker(visit.end, { icon: icon(index === activeIndex ? 'active-red' : 'red', '') }).bindPopup(popup).addTo(layer.current); bounds.push(visit.end); }
    });
    dealers.forEach((dealer) => { if (!dealer.point || !isValidCoordinate(...dealer.point)) return; const popup = `<b>${dealer.companyName || dealer.customerName || 'Assigned dealer'}</b><br/><small>${dealer.accountCode || '—'}<br/>${dealer.address || 'Address unavailable'}<br/>${[dealer.city, dealer.district].filter(Boolean).join(', ')}<br/>Beat: ${dealer.beat || '—'}<br/>Last visit: ${dealer.lastVisit || '—'}</small>`; L.circleMarker(dealer.point, { radius: 6, color: '#0e7490', fillColor: '#38bdf8', fillOpacity: .9, weight: 2 }).bindPopup(popup).addTo(layer.current); bounds.push(dealer.point); });
    specialLocations.forEach((location) => { if (!location.point || !isValidCoordinate(...location.point)) return; const role = location.role === 'attendance-start' ? 'attendance-start' : location.role === 'attendance-stop' ? 'attendance-stop' : location.role === 'inferred-anchor' ? 'inferred-anchor' : location.role === 'route-base' ? 'route-base' : 'reference'; const glyph = role === 'attendance-start' ? 'S' : role === 'attendance-stop' ? 'E' : role === 'inferred-anchor' ? 'I' : role === 'route-base' ? 'B' : '•'; L.marker(location.point, { icon: L.divIcon({ className: 'special-pin-wrap', html: `<span class="special-pin ${role}">${glyph}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindPopup(`<b>${location.label}</b><br/><small>${location.address || (role.startsWith('attendance-') ? 'Attendance GPS' : role === 'inferred-anchor' ? 'Inferred from this employee’s historical Attendance GPS' : role === 'route-base' ? 'Tour plan base' : 'Reference location')}</small>`).addTo(layer.current); bounds.push(location.point); });
    if (route?.geometry?.length && route.geometry.every((point) => Array.isArray(point) && isValidCoordinate(...point))) L.polyline(route.geometry, { color: routeColor, weight: 4, opacity: 0.8 }).addTo(layer.current);
    if (bounds.length) map.current.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
  }, [visits, route, activeIndex, routeColor, routeLabel, dealers, specialLocations]);

  useEffect(() => { const visit = visits[activeIndex]; if (visit?.start && isValidCoordinate(...visit.start)) map.current?.panTo(visit.start); }, [activeIndex, visits]);
  const current = visits[activeIndex];
  return <div className="map-shell"><div ref={mapRef} className="map"/>
    {current && <div className="active-visit"><span>Current visit {activeIndex + 1} / {visits.length}</span><b>{current.companyName || 'Unnamed visit'}</b><small>{current.checkInLocation || 'GPS check-in location'}</small></div>}
    <div className="legend">{specialLocations.some((item) => item.role === 'attendance-start') && <span><i className="attendance-start-dot"/> Attendance Start</span>}{specialLocations.some((item) => item.role === 'inferred-anchor') && <span><i className="inferred-anchor-dot"/> Inferred Attendance Anchor</span>}<span><i className="green-dot"/> Check-In</span>{specialLocations.some((item) => item.role === 'attendance-stop') && <span><i className="attendance-stop-dot"/> Attendance Stop</span>}{specialLocations.some((item) => item.role === 'route-base') && <span><i className="route-base-dot"/> Route base</span>}{specialLocations.some((item) => !item.role) && <span><i className="reference-dot"/> Reference location</span>}{dealers.length>0&&<span><i className="dealer-dot"/> Assigned dealer</span>}<span><i className="line" style={{ background: routeColor }}/> {routeLabel}</span></div>
  </div>;
}
