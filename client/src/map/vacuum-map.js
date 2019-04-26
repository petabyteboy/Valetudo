import { MapDrawer } from "./map-drawer.js";
import { PathDrawer } from "./path-drawer.js";
import { trackTransforms } from "./tracked-canvas.js";
import { GotoPoint, Zone } from "./locations.js";
import { TouchHandler } from "./touch-handling.js";

/**
 * Helper function for calculating coordinates relative to an HTML Element
 * @param {{x: number, y: number}} "{x, y}" - the absolute screen coordinates (clicked)
 * @param {*} referenceElement - the element (e.g. a canvas) to which
 * relative coordinates should be calculated
 * @returns {{x: number, y: number}} coordinates relative to the referenceElement
 */
const relativeCoordinates = ({ x, y }, referenceElement) => {
	var rect = referenceElement.getBoundingClientRect();
	return {
		x: x - rect.left,
		y: y - rect.top
	};
};

/**
 * Transforms coordinates in mapspace (1024*1024) into the millimeter format
 * accepted by the goto / zoned_cleanup api endpoints
 * @param {{x: number, y: number}} coordinatesInMapSpace
 */
const convertToRealCoords = (coordinatesInMapSpace) => {
	return { x: Math.floor(coordinatesInMapSpace.x * 50), y: Math.floor(coordinatesInMapSpace.y * 50) };
};

/**
 * Represents the map and handles all the userinteractions
 * as panning / zooming into the map.
 */
export class VacuumMap extends HTMLCanvasElement {
	constructor() {
		super(...arguments);
		this.mapDrawer = new MapDrawer();
		this.pathDrawer = new PathDrawer();
		this.width = this.clientWidth;
		this.height = this.clientHeight;
		this.ws;
		this.heartbeatTimeout;
		this.locations = [];
		this.redrawCanvas = null;

		(async () => {
			const url = this.attributes["api-url"].value;
			const mapData = await fetch(url).then(resp => resp.json());
			this._initCanvas(mapData);
			this._initWebSocket();
		})();
	}

	_initWebSocket() {
		const protocol = location.protocol === "https:" ? "wss" : "ws";
		if (this.ws) this.ws.close();

		this.ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
		this.ws.onmessage = (evt) => {
			// reset connection timeout
			clearTimeout(this.heartbeatTimeout);
			this.heartbeatTimeout = setTimeout(() => {
				// try to reconnect
				this._initWebSocket();
			}, 5000);

			if(evt.data !== "") {
				try {
					this.updateMap(JSON.parse(evt.data));
				} catch(e) {
					//TODO something reasonable
				}
			}

		};
		this.ws.onerror = () => {
			// try to reconnect
			this._initWebSocket();
		};
	}

	_closeWebSocket() {
		if (this.ws) this.ws.close();
	}

	/**
	 * Public function to update the displayed mapdata periodically.
	 * Data is distributed into the subcomponents for rendering the map / path.
	 * @param {object} mapData - the json data returned by the "/api/map/latest" route
	 */
	updateMap(mapData) {
		this.mapDrawer.draw(mapData.image);
		this.pathDrawer.setPath(mapData.path, mapData.robot);
		this.pathDrawer.draw();
		if (this.redrawCanvas) this.redrawCanvas();
	}

	/**
	 * Sets up the canvas for tracking taps / pans / zooms and redrawing the map accordingly
	 * @param {object} data - the json data returned by the "/api/map/latest" route
	 */
	_initCanvas(data) {
		let ctx = this.getContext('2d');
		ctx.imageSmoothingEnabled = false;
		trackTransforms(ctx);

		window.addEventListener('resize', () => {
			// Save the current transformation and recreate it
			// as the transformation state is lost when changing canvas size
			// https://stackoverflow.com/questions/48044951/canvas-state-lost-after-changing-size
			const {a, b, c, d, e, f} = ctx.getTransform();

			this.height = this.clientHeight;
			this.width = this.clientWidth;

			ctx.setTransform(a, b, c, d, e, f);
			ctx.imageSmoothingEnabled = false;

			redraw();
		});

		this.mapDrawer.draw(data.image);

		const boundingBox = {
			minX: data.image.position.left,
			minY: data.image.position.top,
			maxX: data.image.position.left + data.image.dimensions.width,
			maxY: data.image.position.top + data.image.dimensions.height
		}
		const initialScalingFactor = Math.min(
			this.width / (boundingBox.maxX - boundingBox.minX),
			this.height / (boundingBox.maxY - boundingBox.minY)
		);

		this.pathDrawer.setPath(data.path, data.robot, data.charger);
		this.pathDrawer.scale(initialScalingFactor);

		ctx.scale(initialScalingFactor, initialScalingFactor);
		ctx.translate(-boundingBox.minX, -boundingBox.minY);

		const clearContext = (ctx) => {
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, this.width, this.height);
			ctx.restore();
		}

		/**
		 * Carries out a drawing routine on the canvas with resetting the scaling / translation of the canvas
		 * and restoring it afterwards.
		 * This allows for drawing equally thick lines no matter what the zoomlevel of the canvas currently is.
		 * @param {CanvasRenderingContext2D} ctx - the rendering context to draw on (needs to have "trackTransforms" applied)
		 * @param {function} f - the drawing routine to carry out on the rendering context
		 */
		const usingOwnTransform = (ctx, f) => {
			const transform = ctx.getTransform();
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			f(ctx, transform);
			ctx.restore();
		}

		/**
		 * The function for rendering everything
		 * - Applies the map image from a seperate canvas inside the mapDrawer
		 * - Applies the path image from a seperate canvas inside the pathDrawer
		 *   - The path is redrawn in different zoom levels to enable a smoother image.
		 *	 Therefore the canvas is inversely scaled before drawing the path to account for this scaling.
		 * - Draws the locations ( goto point or zone )
		 */
		const redraw = () => {
			clearContext(ctx);

			ctx.drawImage(this.mapDrawer.canvas, 0, 0);

			let pathScale = this.pathDrawer.getScaleFactor();
			ctx.scale(1 / pathScale, 1 / pathScale);
			ctx.drawImage(this.pathDrawer.canvas, 0, 0);
			ctx.scale(pathScale, pathScale);


			usingOwnTransform(ctx, (ctx, transform) => {
				this.locations.forEach(location => {
					location.draw(ctx, transform);
				});
			});
		}
		redraw();
		this.redrawCanvas = redraw;

		let lastX = this.width / 2, lastY = this.height / 2;

		let dragStart;

		const startTranslate = (evt) => {
			const { x, y } = relativeCoordinates(evt.coordinates, this);
			lastX = x
			lastY = y;
			dragStart = ctx.transformedPoint(lastX, lastY);
		}

		const moveTranslate = (evt) => {
			const { x, y } = relativeCoordinates(evt.currentCoordinates, this);
			const oldX = lastX;
			const oldY = lastY;
			lastX = x;
			lastY = y;

			if (dragStart) {
				// Let each location handle the panning event
				// the location can return a stopPropagation bool which
				// stops the event handling by other locations / the main canvas
				for(let i = 0; i < this.locations.length; ++i) {
					const location = this.locations[i];
					if(typeof location.translate === "function") {
						const result = location.translate(
							dragStart.matrixTransform(ctx.getTransform().inverse()),
							{x: oldX, y: oldY},
							{x, y},
							ctx.getTransform()
						);
						if(result.updatedLocation) {
							this.locations[i] = result.updatedLocation;
						} else {
							this.locations.splice(i, 1);
							i--;
						}
						if(result.stopPropagation === true) {
							redraw();
							return;
						}
					}
				}
				// locations could be removed
				// not quite nice to handle with the for loop
				this.locations = this.locations.filter(location => location !== null);

				// If no location stopped event handling -> pan the whole map
				const pt = ctx.transformedPoint(lastX, lastY);
				ctx.translate(pt.x - dragStart.x, pt.y - dragStart.y);
				redraw();
			}
		}

		const endTranslate = (evt) => {
			dragStart = null;
			redraw();
		}

		const tap = (evt) => {
			const { x, y } = relativeCoordinates(evt.tappedCoordinates, this);
			const tappedX = x;
			const tappedY = y;
			const tappedPoint = ctx.transformedPoint(tappedX, tappedY);

			// Let each location handle the tapping event
			// the location can return a stopPropagation bool which
			// stops the event handling by other locations / the main canvas
			for(let i = 0; i < this.locations.length; ++i) {
				const location = this.locations[i];
				if(typeof location.translate === "function") {
					const result = location.tap({x: tappedX, y: tappedY}, ctx.getTransform());
					if(result.updatedLocation) {
						this.locations[i] = result.updatedLocation;
					} else {
						this.locations.splice(i, 1);
						i--;
					}
					if(result.stopPropagation === true) {
						redraw();
						return;
					}
				}
			}

			if(this.locations.length === 0) {
				this.locations.push(new GotoPoint(tappedPoint.x, tappedPoint.y));
			} else if(this.locations.length === 1 && this.locations[0] instanceof GotoPoint) {
				this.locations[0] = new GotoPoint(tappedPoint.x, tappedPoint.y);
			}

			redraw();
		}

		const touchHandler = new TouchHandler(this);

		let lastScaleFactor = 1;
		const startPinch = (evt) => {
			lastScaleFactor = 1;

			// translate
			const { x, y } = relativeCoordinates(evt.center, this);
			lastX = x
			lastY = y;
			dragStart = ctx.transformedPoint(lastX, lastY);
		}

		const endPinch = (evt) => {
			const [scaleX, scaleY] = ctx.getScaleFactor2d();
			this.pathDrawer.scale(scaleX);
			endTranslate(evt);
		}

		const scalePinch = (evt) => {
			const factor = evt.scale / lastScaleFactor;
			lastScaleFactor = evt.scale;
			const pt = ctx.transformedPoint(evt.center.x, evt.center.y);
			ctx.translate(pt.x, pt.y);
			ctx.scale(factor, factor);
			ctx.translate(-pt.x, -pt.y);

			// translate
			const { x, y } = relativeCoordinates(evt.center, this);
			lastX = x;
			lastY = y;
			const p = ctx.transformedPoint(lastX, lastY);
			ctx.translate(p.x - dragStart.x, p.y - dragStart.y);

			redraw();
		}

		const scaleFactor = 1.1;
		/**
		 * Handles zooming by using the mousewheel.
		 * @param {MouseWheelEvent} evt
		 */
		const handleScroll = (evt) => {
			const delta = evt.wheelDelta ? evt.wheelDelta / 40 : evt.detail ? -evt.detail : 0;
			if (delta) {
				const pt = ctx.transformedPoint(evt.offsetX, evt.offsetY);
				ctx.translate(pt.x, pt.y);
				const factor = Math.pow(scaleFactor, delta);
				ctx.scale(factor, factor);
				ctx.translate(-pt.x, -pt.y);

				const [scaleX, scaleY] = ctx.getScaleFactor2d();
				this.pathDrawer.scale(scaleX);

				redraw();
			}
			return evt.preventDefault() && false;
		};

		this.addEventListener("tap", tap);
		this.addEventListener('panstart', startTranslate);
		this.addEventListener('panmove', moveTranslate);
		this.addEventListener('panend', endTranslate);
		this.addEventListener('pinchstart', startPinch);
		this.addEventListener('pinchmove', scalePinch);
		this.addEventListener('pinchend', endPinch);
		this.addEventListener('DOMMouseScroll', handleScroll, false);
		this.addEventListener('mousewheel', handleScroll, false);
	};

	getLocations() {
		const prepareGotoCoordinatesForApi = (gotoPoint) => {
			const point = convertToRealCoords(gotoPoint);
			return {
				x: point.x,
				y: point.y
			};
		};

		const prepareZoneCoordinatesForApi = (zone) => {
			const p1Real = convertToRealCoords({x: zone.x1, y: zone.y1});
			const p2Real = convertToRealCoords({x: zone.x2, y: zone.y2});

			return [
				Math.min(p1Real.x, p2Real.x),
				Math.min(p1Real.y, p2Real.y),
				Math.max(p1Real.x, p2Real.x),
				Math.max(p1Real.y, p2Real.y)
			];
		};

		const zones = this.locations
			.filter(location => location instanceof Zone)
			.map(prepareZoneCoordinatesForApi);

		const gotoPoints = this.locations
			.filter(location => location instanceof GotoPoint)
			.map(prepareGotoCoordinatesForApi);

		return {
			zones,
			gotoPoints
		};
	}

	addZone() {
		const newZone = new Zone(480, 480, 550, 550);
		this.locations.forEach(location => location.active = false);
		this.locations.push(newZone);
		if (this.redrawCanvas) this.redrawCanvas();
	}
}

customElements.define("vacuum-map", VacuumMap, { "extends": "canvas" });
