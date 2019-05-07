import "@authentic/mwc-drawer";
import "@authentic/mwc-tab-bar";
import "@authentic/mwc-card";
import {LitElement, html, css} from "lit-element";

const mobile = () => window.innerWidth < 600;

class ValetudoLayout extends LitElement {
	render() {
		return html`
			<canvas is="vacuum-map" id="vacuum-map" api-url="/api/map/latest"></canvas>
			<mwc-card>
				<mwc-tab-bar slot="action-buttons">
					<mwc-tab icon="map"></mwc-tab>
					<mwc-tab icon="border_outer"></mwc-tab>
					<mwc-tab icon="gamepad"></mwc-tab>
					<mwc-tab icon="settings"></mwc-tab>
				</mwc-tab-bar>
			</mwc-card>
			<div id="fabs">
				<valetudo-fab is="valetudo-fab" disabled label="Go to dock" id="home" icon="home" api-url="/api/drive_home"></valetudo-fab>
				<valetudo-fab is="valetudo-fab" disabled label="Start cleanup" id="start" icon="play_arrow" api-url="/api/start_cleaning"></valetudo-fab>
				<valetudo-fab is="valetudo-fab" disabled label="Pause cleanup" id="pause" icon="pause" api-url="/api/pause_cleaning"></valetudo-fab>
				<valetudo-fab is="valetudo-fab" disabled label="Stop cleanup" id="stop" icon="stop" api-url="/api/stop_cleaning"></valetudo-fab>
				<valetudo-fab is="valetudo-fab" disabled label="Find robot" id="find" icon="volume_up" api-url="/api/find_robot"></valetudo-fab>
				<!-- <valetudo-fab is="valetudo-fab" disabled label="Spot cleanup" id="spot" icon="arrow_downwards" api-url="/api/spot_clean"></valetudo-fab>
				<mwc-fab label="Go to selected point" id="goto" icon="arrow_right_alt"></mwc-fab> -->
			</div>
		`;

		const map = document.getElementById("vacuum-map");
		document.getElementById("goto").onclick = () => {
			const point = map.getLocations().gotoPoints[0];
			fetch("../api/go_to", {
				method: "put",
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(point),
			}).then(res => res.text()).then(console.log);
		};
	}

	static get styles() {
		return css`
			canvas[is="vacuum-map"] {
				position: absolute;
				top: 0;
				left: 0;
				height: 100%;
				width: 100%;
			}

			.mdc-card {
				border-radius: 0 !important;
				width: 100% !important;
				max-width: unset !important;
			}
			:host {
				position: absolute;
				top: 0;
				right: 0;
				height: 100%;
				width: 100%;
			}

			#fabs {
				display: flex;
				flex-direction: column;
				bottom: 95px;
				width: fit-content;
				position: absolute;
			}

			#fabs>valetudo-fab {
				margin: .5em;
			}

			@media (max-width: 600px) {
				mwc-card {
					position: absolute;
					margin: 0.5em;
					bottom: 0;
					left: 0;
					width: 100%;
				}
				mwc-tab-bar {
					width: 100%;
				}
		
				.mdc-card__action-icons {
					display: none !important;
				}
			}
			@media (min-width: 601px) {
				mwc-card {
					position: absolute;
					top: 0;
					right: 0;
				}
	
				.mdc-card__action-icons {
					display: none !important;
				}
			}
		`;
	}
}

customElements.define("valetudo-layout", ValetudoLayout);
