import {Parameter} from "../sources/types";
import {ReactNode} from "react";

export type Destination = {
    id: string
    displayName: string
    ui?: DestinationUI
    parameters: Parameter[]
}

/**
 * Defines how destination is displayed in UI.
 */
export type DestinationUI = {
    /**
     * Icon (as SVG component)
     */
    icon: ReactNode
    /**
     * Renders title
     * @param cfg destination configuration object
     */
    title: (cfg: object) => ReactNode
    /**
     * Renders connect command for CLI interface
     * @param cfg destination configuration object
     */
    connectCmd: (cfg: object) => string
}