export const renderUtils = {
    getAllOpts: () => {
        return {
            projectObject: true, // 控制是否执行对象投影
            updateMatrixWorld: true,
            sortObjects: true,
            renderBackground: true,
            clippingEnabled: true,
            shadowsEnabled: true,
            useProgramCache: false, // 控制是否使用着
        }
    },
    getAllCloseOpts: () => {
        return {
            projectObject: true, // 控制是否执行对象投影
            updateMatrixWorld: true,
            sortObjects: true,
            renderBackground: true,
            clippingEnabled: true,
            shadowsEnabled: true,
            useProgramCache: false, // 控制是否使用着
        }
    },
    getSubOpths: (state) => {
        return {
            sortObjects: state,
            renderBackground: state,
        }
    }
    ,
    getStandardOpts: (
        opts = {
        },
        otherOpts = {
            subOptsState: undefined
        }
    ) => {
        const subOpts = otherOpts.subOptsState === undefined ? {} : renderUtils.getSubOpths(otherOpts.subOptsState)
        return {
            ...opts,
            ...subOpts
        }
    }
}