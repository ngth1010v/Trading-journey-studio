

export default function PageEditor({
    pageId,
    goHome,
    goToLoader
}:{
    pageId: number
    goHome: ()=>void
    goToLoader: (pageId: number)=>void
}){
    return (
        <div style={{height: "100%", width: "100%", display:"flex", alignItems:"center", justifyItems:"center"}}>
            <h1>This is a pageEditor placeholder: {pageId}</h1>
            <div onClick={goHome} style={{padding: "10px", background:"#112", margin: "10px"}}>Go home</div>
            <div onClick={()=>goToLoader(pageId)} style={{padding: "10px", background:"#112", margin: "10px"}}>Go to loader</div>
        </div>
    )
}