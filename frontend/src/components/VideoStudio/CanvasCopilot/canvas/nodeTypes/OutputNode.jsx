import BaseNode from './BaseNode';
export default function OutputNode({ data, selected }) {
    return (
        <BaseNode data={data} selected={selected} icon="🏁" costClass="free" accentColor="#10b981"
            inputPorts={[
                { id: 'video', type: 'video', label: 'Video', required: false },
                { id: 'image', type: 'image', label: 'Image', required: false },
                { id: 'audio', type: 'audio', label: 'Audio', required: false },
            ]}
            outputPorts={[]}
        >
            <div className="node-param-row">
                <span className="node-param-key">Label</span>
                <span className="node-param-val">{data?.params?.label || 'Final Output'}</span>
            </div>
        </BaseNode>
    );
}
