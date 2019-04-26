import {Fab} from "@material/mwc-fab";

class ValetudoFab extends Fab {
	constructor() {
		super(...arguments);
		console.log("!");
		this.addEventListener("click", () => {
			const url = this.attributes["api-url"].value;
			fetch(url, {
				method: "put",
			});
		});
	}
}

customElements.define("valetudo-fab", ValetudoFab);
