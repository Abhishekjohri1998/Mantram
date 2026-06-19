import BaseNode from './BaseNode';
export default function AssetInputNode({ data, selected }) {
    return (
        <BaseNode data={data} selected={selected} icon="📎" costClass="free" accentColor="#8b5cf6"
            inputPorts={[]}
            outputPorts={[
                { id: 'image', type: 'image', label: 'Image' },
                { id: 'video', type: 'video', label: 'Video' },
                { id: 'audio', type: 'audio', label: 'Audio' },
            ]}
        >
            {data?.params?.url ? (
                <img src={data.params.url} className="canvas-node__media" alt="asset" style={{borderRadius:6,margin:0}} />
            ) : (
                <div className="node-text-preview"><span style={{opacity:0.35,fontStyle:'italic'}}>No asset — configure in inspector</span></div>
            )}
        </BaseNode>
    );
}
